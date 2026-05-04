export type STTProvider = "openai-whisper" | "local-whisper" | "deepgram";
export type TTSProvider = "openai-tts" | "elevenlabs" | "local-espeak";

export interface VoiceConfig {
  sttProvider: STTProvider;
  ttsProvider: TTSProvider;
  sttApiKey?: string;
  ttsApiKey?: string;
  sttBaseUrl?: string;    // for local-whisper
  ttsBaseUrl?: string;    // for local TTS
  ttsVoice?: string;      // e.g. "alloy", "nova", "echo" for OpenAI
  ttsModel?: string;      // e.g. "tts-1", "tts-1-hd"
  ttsSpeed?: number;      // 0.25–4.0
  language?: string;      // e.g. "en" for Whisper
  outputFormat?: "mp3" | "opus" | "aac" | "flac" | "wav";
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  durationMs?: number;
}

export interface SynthesisResult {
  audioData: Uint8Array;
  format: string;
  durationMs?: number;
}
