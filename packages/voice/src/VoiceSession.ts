/**
 * VoiceSession: wires STT → agent queryLoop → TTS
 * for a real-time voice-driven agent interaction.
 */
import { STTClient } from "./STTClient";
import { TTSClient } from "./TTSClient";
import type { VoiceConfig } from "./types";
import { queryLoop, resolveSettings, resolveProvider, QueryEngine, type Message } from "@cowork/core";
import { DEFAULT_TOOLS } from "@cowork/core";
import { mkdir } from "node:fs/promises";
import path from "path";
import { tmpdir } from "node:os";

export interface VoiceSessionConfig extends VoiceConfig {
  projectRoot: string;
  systemPrompt?: string;
  playAudio?: boolean;      // auto-play TTS output (requires 'afplay' or 'aplay')
  saveAudio?: boolean;      // save audio files to project .cowork/voice/
  verbose?: boolean;
}

export class VoiceSession {
  private stt: STTClient;
  private tts: TTSClient;
  private config: VoiceSessionConfig;
  private history: Array<{ role: string; content: string }> = [];

  constructor(config: VoiceSessionConfig) {
    this.config = config;
    this.stt = new STTClient(config);
    this.tts = new TTSClient(config);
  }

  /**
   * Process a single voice turn: audio → text → agent → speech.
   * audioInput: path to audio file or raw audio bytes.
   * Returns the agent's text response and synthesized audio.
   */
  async processTurn(
    audioInput: string | Uint8Array
  ): Promise<{ text: string; audioData: Uint8Array; format: string }> {
    // ── STT ───────────────────────────────────────────────────────────────
    if (this.config.verbose) console.error("[Voice] Transcribing audio…");
    const transcription = await this.stt.transcribe(audioInput);
    const userText = transcription.text.trim();

    if (this.config.verbose) console.error(`[Voice] User said: "${userText}"`);
    if (!userText) {
      const silence = await this.tts.synthesize("I didn't catch that. Could you repeat?");
      return { text: "(empty transcription)", ...silence };
    }

    // ── Agent ──────────────────────────────────────────────────────────────
    const settings = await resolveSettings(this.config.projectRoot, process.env, {});
    const provider = resolveProvider({
      provider: settings.provider,
      model: settings.model,
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      env: process.env,
    });
    const engine = new QueryEngine(provider);
    const history: Message[] = [
      ...this.history.map((h) => ({ role: h.role as Message["role"], content: h.content })),
      { role: "user" as const, content: userText },
    ];
    let agentText = "";

    for await (const event of queryLoop(userText, {
      engine,
      systemPrompt:
        this.config.systemPrompt ??
        "You are a helpful voice assistant. Keep responses concise (2–3 sentences max) since they will be spoken aloud.",
      tools: DEFAULT_TOOLS,
      history,
      policy: {
        permissionLevel: settings.permissionLevel,
        requestApproval: async () => false,
        settings,
        workingDirectory: this.config.projectRoot,
        maxTurns: 6,
      },
    })) {
      if (event.type === "complete") agentText = event.text;
    }

    if (!agentText) agentText = "I'm sorry, I couldn't process that request.";

    // Update history
    this.history.push({ role: "user", content: userText });
    this.history.push({ role: "assistant", content: agentText });
    if (this.history.length > 40) this.history.splice(0, 2);

    // ── TTS ────────────────────────────────────────────────────────────────
    if (this.config.verbose) console.error("[Voice] Synthesizing speech…");
    const synthesis = await this.tts.synthesize(agentText);

    // Optionally save audio
    if (this.config.saveAudio) {
      const dir = path.join(this.config.projectRoot, ".cowork", "voice");
      // @ts-ignore
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const ts = Date.now();
      await Bun.write(
        path.join(dir, `response-${ts}.${synthesis.format}`),
        synthesis.audioData
      );
    }

    // Optionally play audio
    if (this.config.playAudio) {
      await this.playAudio(synthesis.audioData, synthesis.format);
    }

    return { text: agentText, audioData: synthesis.audioData, format: synthesis.format };
  }

  private async playAudio(data: Uint8Array, format: string): Promise<void> {
    const tmpFile = path.join(tmpdir(), `cowork-voice-${Date.now()}.${format}`);
    await Bun.write(tmpFile, data);

    const player = process.platform === "darwin" ? "afplay" : "aplay";
    const proc = Bun.spawn([player, tmpFile], { stdout: "ignore", stderr: "ignore" });
    await proc.exited;
  }
}
