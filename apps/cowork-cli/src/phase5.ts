/**
 * Phase 5 session extensions.
 * Wires streaming providers, eval framework awareness,
 * voice, memory-v2, ReAct, marketplace, projects, and enhanced REPL.
 */

import type { SessionRuntime } from "@cowork/core";
import { VOICE_TOOLS } from "@cowork/voice";
import { MEMORY_V2_TOOLS } from "@cowork/memory-v2";
import { REACT_TOOLS } from "@cowork/react-agent";
import { MARKETPLACE_TOOLS } from "@cowork/marketplace";
import { PROJECT_TOOLS } from "@cowork/projects";
import { SyntaxHighlighter } from "@cowork/core";
import {
  AnthropicStreamProvider,
  OpenAIStreamProvider,
} from "@cowork/core";

export interface Phase5Runtime {
  syntaxHighlighter: SyntaxHighlighter;
  streamingEnabled: boolean;
}

export async function bootstrapPhase5(
  runtime: SessionRuntime,
  options: {
    enableVoice?: boolean;
    enableMemoryV2?: boolean;
    enableReAct?: boolean;
    enableMarketplace?: boolean;
    enableProjects?: boolean;
    enableStreaming?: boolean;
    colorTheme?: "dark" | "light" | "none";
  } = {}
): Promise<Phase5Runtime> {
  // ── 1. Voice tools ────────────────────────────────────────────────────────
  if (
    options.enableVoice !== false &&
    (process.env.OPENAI_API_KEY ||
      process.env.ELEVENLABS_API_KEY ||
      process.env.COWORK_STT_PROVIDER === "local-whisper")
  ) {
    for (const tool of VOICE_TOOLS) runtime.tools.push(tool);
  }

  // ── 2. Memory V2 tools ─────────────────────────────────────────────────────
  if (options.enableMemoryV2 !== false) {
    for (const tool of MEMORY_V2_TOOLS) runtime.tools.push(tool);
  }

  // ── 3. ReAct tools ─────────────────────────────────────────────────────────
  if (options.enableReAct !== false) {
    for (const tool of REACT_TOOLS) runtime.tools.push(tool);
  }

  // ── 4. Marketplace tools ───────────────────────────────────────────────────
  if (options.enableMarketplace !== false) {
    for (const tool of MARKETPLACE_TOOLS) runtime.tools.push(tool);
  }

  // ── 5. Project management tools ─────────────────────────────────────────────
  if (options.enableProjects !== false) {
    for (const tool of PROJECT_TOOLS) runtime.tools.push(tool);
  }

  // ── 6. Syntax highlighter ──────────────────────────────────────────────────
  const syntaxHighlighter = new SyntaxHighlighter(
    (options.colorTheme as any) ?? (process.env.COWORK_COLOR_THEME as any) ?? "dark",
    runtime.tools.map((t) => t.name)
  );

  // ── 7. Streaming provider setup ────────────────────────────────────────────
  let streamingEnabled = false;
  if (options.enableStreaming !== false && process.env.COWORK_STREAMING === "true") {
    const provider = runtime.settings.provider;
    const model = runtime.settings.model;

    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      runtime.streamingProvider = new AnthropicStreamProvider(
        process.env.ANTHROPIC_API_KEY,
        model
      );
      streamingEnabled = true;
    } else if (
      ["openai", "ollama", "lmstudio", "deepseek", "openrouter"].includes(provider)
    ) {
      const baseUrlMap: Record<string, string> = {
        openai: "https://api.openai.com/v1",
        ollama: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
        lmstudio: process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1",
        deepseek: "https://api.deepseek.com/v1",
        openrouter: "https://openrouter.ai/api/v1",
      };
      const apiKeyEnvs: Record<string, string> = {
        openai: process.env.OPENAI_API_KEY ?? "",
        deepseek: process.env.DEEPSEEK_API_KEY ?? "",
        openrouter: process.env.OPENROUTER_API_KEY ?? "",
        ollama: "",
        lmstudio: "",
      };
      runtime.streamingProvider = new OpenAIStreamProvider(
        apiKeyEnvs[provider] ?? "",
        baseUrlMap[provider] ?? "",
        model
      );
      streamingEnabled = true;
    }
  }

  return { syntaxHighlighter, streamingEnabled };
}
