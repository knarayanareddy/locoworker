import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderName } from "../providers/ProviderInterface.js";
import {
  type PermissionMode,
  modeToLevel,
  parsePermissionMode,
} from "../permissions/PermissionLevel.js";
import type { PermissionLevel } from "../permissions/PermissionLevel.js";

export type SandboxMode = "none" | "docker" | "podman";

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
  /** Phase 5: MCP server configurations */
  mcpServers?: import("../mcp/index.js").McpServerConfig[];
  /** Phase 5: Enable Graphify knowledge-graph tools */
  enableGraphify?: boolean;
  /** Phase 6: Enable LLMWiki tools */
  enableWiki?: boolean;
  /** Phase 6: Security Sandboxing for Bash commands */
  sandboxMode?: SandboxMode;
  /** Enforce the outbound network allowlist for tools such as HttpFetch. */
  sandboxEnabled?: boolean;
  sandboxAllowlist?: string[];
};

export type ResolvedSettings = Settings & {
  permissionLevel: PermissionLevel;
};

export const PROVIDER_NAMES: readonly ProviderName[] = [
  "anthropic", "openai", "ollama", "lmstudio", "deepseek", "openrouter",
];
const SANDBOX_MODES: readonly SandboxMode[] = ["none", "docker", "podman"];

/**
 * Keys that a repository-local settings file is NOT allowed to set. A cloned
 * repo is untrusted: otherwise it could raise its own permission level,
 * redirect API calls (and the user's key) to another host, or register an MCP
 * server that executes arbitrary commands at startup.
 */
const PROJECT_UNTRUSTED_KEYS = [
  "apiKey", "baseUrl", "embedderApiKey", "embedderUrl",
  "mcpServers", "permissionMode", "sandboxMode", "sandboxAllowlist", "sandboxEnabled",
] as const;

const DEFAULTS: Settings = {
  provider: "ollama",
  permissionMode: "standard",
  maxTurns: 50,
  maxTokens: 4096,
  workingDirectory: process.cwd(),
  contextWindow: 100_000,
  loadProjectContext: true,
  persistTranscripts: true,
  enableGraphify: false,
  enableWiki: true,
  sandboxMode: "none",
  sandboxEnabled: false,
  sandboxAllowlist: [],
};

/**
 * Cascade order (later overrides earlier):
 *   1. Built-in defaults
 *   2. ~/.cowork/settings.json
 *   3. <project>/.cowork/settings.json (untrusted keys are ignored)
 *   4. Environment variables
 *   5. CLI flags (passed in via `overrides`)
 */
export function getCoworkHome(): string {
  if (process.env.COWORK_HOME) return process.env.COWORK_HOME;
  return join(homedir(), ".cowork");
}

function parsePositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error(`Invalid ${field}: expected a positive integer, got "${String(value)}"`);
  }
  return n;
}

/** Validate the merged result. Throws with an actionable message (fail closed). */
export function validateSettings(merged: Settings): Settings {
  if (!PROVIDER_NAMES.includes(merged.provider)) {
    throw new Error(`Invalid provider "${merged.provider}". Expected one of: ${PROVIDER_NAMES.join(", ")}`);
  }
  merged.permissionMode = parsePermissionMode(merged.permissionMode);
  if (merged.sandboxMode && !SANDBOX_MODES.includes(merged.sandboxMode)) {
    throw new Error(`Invalid sandboxMode "${merged.sandboxMode}". Expected one of: ${SANDBOX_MODES.join(", ")}`);
  }
  merged.maxTurns = parsePositiveInt(merged.maxTurns, "maxTurns") ?? DEFAULTS.maxTurns;
  merged.maxTokens = parsePositiveInt(merged.maxTokens, "maxTokens") ?? DEFAULTS.maxTokens;
  merged.contextWindow = parsePositiveInt(merged.contextWindow, "contextWindow") ?? DEFAULTS.contextWindow;
  if (!Array.isArray(merged.sandboxAllowlist)) merged.sandboxAllowlist = [];
  if (merged.baseUrl) {
    let parsed: URL;
    try { parsed = new URL(merged.baseUrl); } catch {
      throw new Error(`Invalid baseUrl "${merged.baseUrl}"`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Invalid baseUrl protocol "${parsed.protocol}" (expected http or https)`);
    }
  }
  return merged;
}

/**
 * Keys a remote/authenticated dashboard is allowed to write. Credentials,
 * endpoints, MCP servers and permission changes are deliberately excluded:
 * a settings API must never be an arbitrary-code or exfiltration primitive.
 */
export const SETTINGS_PATCH_KEYS = [
  "provider", "model", "maxTurns", "maxTokens", "contextWindow",
  "enableGraphify", "enableWiki", "loadProjectContext", "persistTranscripts",
] as const;

export function validateSettingsPatch(patch: unknown): Partial<Settings> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Settings patch must be a JSON object");
  }
  const input = patch as Record<string, unknown>;
  const unknownKeys = Object.keys(input).filter(
    (k) => !(SETTINGS_PATCH_KEYS as readonly string[]).includes(k),
  );
  if (unknownKeys.length > 0) {
    throw new Error(`Settings keys not allowed: ${unknownKeys.join(", ")}`);
  }
  const candidate: Settings = { ...DEFAULTS, ...(input as Partial<Settings>) };
  validateSettings(candidate);
  for (const key of ["enableGraphify", "enableWiki", "loadProjectContext", "persistTranscripts"] as const) {
    if (key in input && typeof input[key] !== "boolean") {
      throw new Error(`${key} must be a boolean`);
    }
  }
  if ("model" in input && typeof input.model !== "string") throw new Error("model must be a string");
  const out: Partial<Settings> = {};
  for (const key of SETTINGS_PATCH_KEYS) {
    if (key in input) (out as Record<string, unknown>)[key] = candidate[key];
  }
  return out;
}

export async function resolveSettings(
  cwd: string,
  env: NodeJS.ProcessEnv,
  overrides: Partial<Settings> = {},
): Promise<ResolvedSettings> {
  const userSettings = await tryLoadJson(join(getCoworkHome(), "settings.json"));
  const rawProjectSettings = await tryLoadJson(join(cwd, ".cowork", "settings.json"));
  const projectSettings: Partial<Settings> = { ...rawProjectSettings };
  for (const key of PROJECT_UNTRUSTED_KEYS) {
    if (key in projectSettings) {
      delete (projectSettings as Record<string, unknown>)[key];
      console.warn(
        `[settings] ignoring "${key}" from project .cowork/settings.json (untrusted repository config)`,
      );
    }
  }

  const fromEnv: Partial<Settings> = {};
  if (env.COWORK_PROVIDER) fromEnv.provider = env.COWORK_PROVIDER as ProviderName;
  if (env.COWORK_MODEL) fromEnv.model = env.COWORK_MODEL;
  if (env.COWORK_PERMISSION_MODE) fromEnv.permissionMode = env.COWORK_PERMISSION_MODE as PermissionMode;
  if (env.COWORK_MAX_TURNS) fromEnv.maxTurns = parsePositiveInt(env.COWORK_MAX_TURNS, "COWORK_MAX_TURNS");
  if (env.COWORK_MAX_TOKENS) fromEnv.maxTokens = parsePositiveInt(env.COWORK_MAX_TOKENS, "COWORK_MAX_TOKENS");
  if (env.COWORK_CONTEXT_WINDOW) fromEnv.contextWindow = parsePositiveInt(env.COWORK_CONTEXT_WINDOW, "COWORK_CONTEXT_WINDOW");
  if (env.COWORK_EMBEDDER_URL) fromEnv.embedderUrl = env.COWORK_EMBEDDER_URL;
  if (env.COWORK_EMBEDDER_MODEL) fromEnv.embedderModel = env.COWORK_EMBEDDER_MODEL;
  if (env.COWORK_EMBEDDER_API_KEY) fromEnv.embedderApiKey = env.COWORK_EMBEDDER_API_KEY;
  if (env.COWORK_ENABLE_GRAPHIFY) fromEnv.enableGraphify = env.COWORK_ENABLE_GRAPHIFY === "true";
  if (env.COWORK_WIKI_ENABLED) fromEnv.enableWiki = env.COWORK_WIKI_ENABLED === "true";
  if (env.COWORK_SANDBOX_MODE) fromEnv.sandboxMode = env.COWORK_SANDBOX_MODE as SandboxMode;
  if (env.COWORK_SANDBOX_ENABLED) fromEnv.sandboxEnabled = env.COWORK_SANDBOX_ENABLED === "true";
  if (env.COWORK_SANDBOX_ALLOWLIST) {
    fromEnv.sandboxAllowlist = env.COWORK_SANDBOX_ALLOWLIST.split(",").map((s) => s.trim()).filter(Boolean);
  }

  const merged: Settings = {
    ...DEFAULTS,
    ...userSettings,
    ...projectSettings,
    ...fromEnv,
    ...overrides,
    workingDirectory: cwd,
  };

  return {
    ...validateSettings(merged),
    permissionLevel: modeToLevel(merged.permissionMode),
  };
}

async function tryLoadJson(path: string): Promise<Partial<Settings>> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("settings file must contain a JSON object");
    }
    return parsed as Partial<Settings>;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${path}: ${e.message}`);
    }
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
