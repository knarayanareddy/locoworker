import type { VoiceConfig, SynthesisResult } from "./types";

export class TTSClient {
  private config: VoiceConfig;

  constructor(config: VoiceConfig) {
    this.config = config;
  }

  async synthesize(text: string): Promise<SynthesisResult> {
    switch (this.config.ttsProvider) {
      case "openai-tts":
        return this.synthesizeOpenAI(text);
      case "elevenlabs":
        return this.synthesizeElevenLabs(text);
      case "local-espeak":
        return this.synthesizeEspeak(text);
      default:
        throw new Error(`Unknown TTS provider: ${this.config.ttsProvider}`);
    }
  }

  // ── OpenAI TTS ─────────────────────────────────────────────────────────────

  private async synthesizeOpenAI(text: string): Promise<SynthesisResult> {
    const apiKey = this.config.ttsApiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("TTSClient: OPENAI_API_KEY not set");

    const body = {
      model: this.config.ttsModel ?? "tts-1",
      input: text.slice(0, 4096),
      voice: this.config.ttsVoice ?? "alloy",
      response_format: this.config.outputFormat ?? "mp3",
      speed: this.config.ttsSpeed ?? 1.0,
    };

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`OpenAI TTS error: ${await res.text()}`);
    const audioData = new Uint8Array(await res.arrayBuffer());
    return { audioData, format: body.response_format };
  }

  // ── ElevenLabs ─────────────────────────────────────────────────────────────

  private async synthesizeElevenLabs(text: string): Promise<SynthesisResult> {
    const apiKey = this.config.ttsApiKey ?? process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("TTSClient: ELEVENLABS_API_KEY not set");

    const voiceId = this.config.ttsVoice ?? "EXAVITQu4vr4xnSDxMaL"; // default "Bella"

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.slice(0, 5000),
          model_id: "eleven_monolingual_v1",
          voice_settings: { stability: 0.5, similarity_boost: 0.5 },
        }),
      }
    );

    if (!res.ok) throw new Error(`ElevenLabs TTS error: ${await res.text()}`);
    const audioData = new Uint8Array(await res.arrayBuffer());
    return { audioData, format: "mp3" };
  }

  // ── Local eSpeak (zero-dependency fallback) ────────────────────────────────

  private async synthesizeEspeak(text: string): Promise<SynthesisResult> {
    const proc = Bun.spawn(
      ["espeak", "-v", this.config.ttsVoice ?? "en", "--stdout", text.slice(0, 2000)],
      { stdout: "pipe", stderr: "pipe" }
    );
    const audioData = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
    return { audioData, format: "wav" };
  }
}
