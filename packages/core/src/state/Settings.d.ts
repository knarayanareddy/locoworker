import type { ProviderName } from "../providers/ProviderInterface.js";
import { type PermissionMode } from "../permissions/PermissionLevel.js";
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
/**
 * Cascade order (later overrides earlier):
 *   1. Built-in defaults
 *   2. ~/.cowork/settings.json
 *   3. <project>/.cowork/settings.json
 *   4. Environment variables
 *   5. CLI flags (passed in via `overrides`)
 */
export declare function resolveSettings(cwd: string, env: NodeJS.ProcessEnv, overrides?: Partial<Settings>): Promise<ResolvedSettings>;
export declare const SYSTEM_PROMPT = "You are Locoworker, an agentic coding assistant running locally in the user's terminal.\n\nYou have access to tools for reading and editing files, searching the codebase, and running shell commands. Use them deliberately:\n- Read before you edit\n- Use Glob and Grep to find things rather than guessing paths\n- Prefer Edit (surgical replacement) over Write (full overwrite) for existing files\n- Use Bash for build, test, and git commands; never for destructive operations\n\nBe concise. Show your work through tool calls, not narration. When the task is complete, give a one-paragraph summary of what changed.";
//# sourceMappingURL=Settings.d.ts.map