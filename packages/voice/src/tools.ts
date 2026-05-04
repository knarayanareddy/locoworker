import type { ToolDefinition, ToolContext } from "@cowork/core";

export const VoiceTranscribe: ToolDefinition = {
  name: "VoiceTranscribe",
  description:
    "Transcribe an audio file to text using Whisper STT. " +
    "Provide a file path to an audio file (wav, mp3, m4a, ogg, flac). " +
    "Returns the transcription text.",
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Path to the audio file (relative to cwd)",
      },
      language: {
        type: "string",
        description: "Optional language hint e.g. 'en', 'es', 'fr'",
      },
    },
    required: ["filePath"],
  },
  permissionLevel: "STANDARD",
  async execute(input: { filePath: string; language?: string }, ctx: ToolContext) {
    const { STTClient } = await import("./STTClient");
    const provider = (process.env.COWORK_STT_PROVIDER as any) ?? "openai-whisper";
    const client = new STTClient({
      sttProvider: provider,
      ttsProvider: "openai-tts",
      sttApiKey: process.env.OPENAI_API_KEY,
      language: input.language,
    });

    const absPath = input.filePath.startsWith("/")
      ? input.filePath
      : `${ctx.workingDirectory}/${input.filePath}`;

    try {
      const result = await client.transcribe(absPath);
      return { content: result.text, isError: false };
    } catch (err) {
      return {
        content: `Transcription error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

export const VoiceSynthesize: ToolDefinition = {
  name: "VoiceSynthesize",
  description:
    "Convert text to speech and save the audio file. " +
    "Returns the path to the saved audio file.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to synthesize" },
      outputFile: {
        type: "string",
        description: "Output file path (relative to cwd). Default: voice-output.mp3",
      },
      voice: {
        type: "string",
        description: "Voice name (provider-specific). OpenAI: alloy, echo, fable, nova, onyx, shimmer",
      },
    },
    required: ["text"],
  },
  permissionLevel: "STANDARD",
  async execute(
    input: { text: string; outputFile?: string; voice?: string },
    ctx: ToolContext
  ) {
    const { TTSClient } = await import("./TTSClient");
    const provider = (process.env.COWORK_TTS_PROVIDER as any) ?? "openai-tts";
    const client = new TTSClient({
      sttProvider: "openai-whisper",
      ttsProvider: provider,
      ttsApiKey: process.env.OPENAI_API_KEY ?? process.env.ELEVENLABS_API_KEY,
      ttsVoice: input.voice,
      outputFormat: "mp3",
    });

    try {
      const result = await client.synthesize(input.text);
      const outputPath = input.outputFile ?? "voice-output.mp3";
      const absPath = outputPath.startsWith("/")
        ? outputPath
        : `${ctx.workingDirectory}/${outputPath}`;
      await Bun.write(absPath, result.audioData);
      return { content: `Audio saved to ${outputPath} (${result.format})`, isError: false };
    } catch (err) {
      return {
        content: `Synthesis error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

export const VOICE_TOOLS: ToolDefinition[] = [VoiceTranscribe, VoiceSynthesize];
