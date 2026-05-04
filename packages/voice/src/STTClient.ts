import type { VoiceConfig, TranscriptionResult } from "./types";
import path from "path";

export class STTClient {
  private config: VoiceConfig;

  constructor(config: VoiceConfig) {
    this.config = config;
  }

  /**
   * Transcribe audio from a file path or raw Uint8Array.
   */
  async transcribe(
    audio: string | Uint8Array,
    mimeType = "audio/wav"
  ): Promise<TranscriptionResult> {
    switch (this.config.sttProvider) {
      case "openai-whisper":
        return this.transcribeOpenAI(audio, mimeType);
      case "local-whisper":
        return this.transcribeLocalWhisper(audio);
      case "deepgram":
        return this.transcribeDeepgram(audio, mimeType);
      default:
        throw new Error(`Unknown STT provider: ${this.config.sttProvider}`);
    }
  }

  // ── OpenAI Whisper API ─────────────────────────────────────────────────────

  private async transcribeOpenAI(
    audio: string | Uint8Array,
    mimeType: string
  ): Promise<TranscriptionResult> {
    const apiKey = this.config.sttApiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("STTClient: OPENAI_API_KEY not set");

    const form = new FormData();

    if (typeof audio === "string") {
      const blob = new Blob([await Bun.file(audio).arrayBuffer()], { type: mimeType });
      form.append("file", blob, path.basename(audio));
    } else {
      form.append("file", new Blob([audio], { type: mimeType }), "audio.wav");
    }

    form.append("model", "whisper-1");
    if (this.config.language) form.append("language", this.config.language);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Whisper API error: ${err}`);
    }

    const data = await res.json() as { text: string };
    return { text: data.text };
  }

  // ── Local Whisper (OpenAI-compatible local server) ──────────────────────────

  private async transcribeLocalWhisper(
    audio: string | Uint8Array
  ): Promise<TranscriptionResult> {
    const baseUrl = this.config.sttBaseUrl ?? "http://localhost:8080";
    const form = new FormData();

    const audioData =
      typeof audio === "string" ? await Bun.file(audio).arrayBuffer() : audio.buffer;
    form.append("file", new Blob([audioData], { type: "audio/wav" }), "audio.wav");
    form.append("model", "whisper-1");

    const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) throw new Error(`Local Whisper error: ${await res.text()}`);
    const data = await res.json() as { text: string };
    return { text: data.text };
  }

  // ── Deepgram ───────────────────────────────────────────────────────────────

  private async transcribeDeepgram(
    audio: string | Uint8Array,
    mimeType: string
  ): Promise<TranscriptionResult> {
    const apiKey = this.config.sttApiKey ?? process.env.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error("STTClient: DEEPGRAM_API_KEY not set");

    const audioData =
      typeof audio === "string" ? await Bun.file(audio).arrayBuffer() : audio.buffer;

    const res = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": mimeType,
        },
        body: audioData,
      }
    );

    if (!res.ok) throw new Error(`Deepgram error: ${await res.text()}`);
    const data = await res.json() as any;
    const text =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    return { text };
  }
}
