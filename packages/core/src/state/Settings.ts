import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderName } from "../providers/ProviderInterface.js";
import { type PermissionMode, modeToLevel } from "../permissions/PermissionLevel.js";
import type { PermissionLevel } from "../permissions/PermissionLevel.js";

export type Settings = {
  provider: ProviderName;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  permissionMode: PermissionMode;
  maxTurns: number;
  maxTokens: number;
  workingDirectory: string;
  systemPrompt?: string;
  /** Soft target for the model's context window (used by AutoCompact triggers). */
  contextWindow: number;
  /** Embedder endpoint for vector search (any OpenAI-compat /v1/embeddings). */
  embedderUrl?: string;
  embedderModel?: string;
  embedderApiKey?: string;
  /** When false, MEMORY.md and CLAUDE.md are not auto-loaded into the system prompt. */
  loadProjectContext: boolean;
  /** When false, transcripts are not persisted to disk. */
  persistTranscripts: boolean;
};

export type ResolvedSettings = Settings & {
  permissionLevel: PermissionLevel;
};

const DEFAULTS: Settings = {
  provider: "ollama",
  permissionMode: "standard",
  maxTurns: 50,
  maxTokens: 4096,
  workingDirectory: process.cwd(),
  contextWindow: 100_000,
  loadProjectContext: true,
  persistTranscripts: true,
};

/**
 * Cascade order (later overrides earlier):
 *   1. Built-in defaults
 *   2. ~/.cowork/settings.json
 *   3. <project>/.cowork/settings.json
 *   4. Environment variables
 *   5. CLI flags (passed in via `overrides`)
 */
export async function resolveSettings(
  cwd: string,
  env: NodeJS.ProcessEnv,
  overrides: Partial<Settings> = {},
): Promise<ResolvedSettings> {
  const userSettings = await tryLoadJson(join(homedir(), ".cowork", "settings.json"));
  const projectSettings = await tryLoadJson(join(cwd, ".cowork", "settings.json"));

  const fromEnv: Partial<Settings> = {};
  if (env.COWORK_PROVIDER) fromEnv.provider = env.COWORK_PROVIDER as ProviderName;
  if (env.COWORK_MODEL) fromEnv.model = env.COWORK_MODEL;
  if (env.COWORK_PERMISSION_MODE) {
    fromEnv.permissionMode = env.COWORK_PERMISSION_MODE as PermissionMode;
  }
  if (env.COWORK_MAX_TURNS) {
    const n = Number(env.COWORK_MAX_TURNS);
    if (Number.isFinite(n)) fromEnv.maxTurns = n;
  }
  if (env.COWORK_MAX_TOKENS) {
    const n = Number(env.COWORK_MAX_TOKENS);
    if (Number.isFinite(n)) fromEnv.maxTokens = n;
  }
  if (env.COWORK_CONTEXT_WINDOW) {
    const n = Number(env.COWORK_CONTEXT_WINDOW);
    if (Number.isFinite(n)) fromEnv.contextWindow = n;
  }
  if (env.COWORK_EMBEDDER_URL) fromEnv.embedderUrl = env.COWORK_EMBEDDER_URL;
  if (env.COWORK_EMBEDDER_MODEL) fromEnv.embedderModel = env.COWORK_EMBEDDER_MODEL;
  if (env.COWORK_EMBEDDER_API_KEY) fromEnv.embedderApiKey = env.COWORK_EMBEDDER_API_KEY;

  const merged: Settings = {
    ...DEFAULTS,
    ...userSettings,
    ...projectSettings,
    ...fromEnv,
    ...overrides,
    workingDirectory: cwd,
  };

  return {
    ...merged,
    permissionLevel: modeToLevel(merged.permissionMode),
  };
}

async function tryLoadJson(path: string): Promise<Partial<Settings>> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as Partial<Settings>;
  } catch {
    return {};
  }
}

export const SYSTEM_PROMPT = `You are Locoworker, an agentic coding assistant running locally in the user's terminal.

You have access to tools for reading and editing files, searching the codebase, and running shell commands. Use them deliberately:
- Read before you edit
- Use Glob and Grep to find things rather than guessing paths
- Prefer Edit (surgical replacement) over Write (full overwrite) for existing files
- Use Bash for build, test, and git commands; never for destructive operations

Be concise. Show your work through tool calls, not narration. When the task is complete, give a one-paragraph summary of what changed.`;
