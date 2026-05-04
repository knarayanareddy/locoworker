// packages/core/src/index.ts
// Public API surface — Phase 5 additions: mcp, hooks, skills, session.

// ── Agent primitives ─────────────────────────────────────────────────────────
export { queryLoop }            from "./queryLoop.js";
export type { QueryLoopConfig } from "./queryLoop.js";
export { QueryEngine }          from "./QueryEngine.js";
export type { Message, ContentBlock, AgentEvent } from "./types.js";

// ── Tool system ───────────────────────────────────────────────────────────────
export type { ToolDefinition, ExecutionContext } from "./Tool.js";
export { ok, err }              from "./Tool.js";
export { DEFAULT_TOOLS }        from "./tools/index.js";
export { makeMemoryTools }      from "./tools/memory/index.js";

// ── Providers ─────────────────────────────────────────────────────────────────
export { resolveProvider }      from "./providers/ProviderRouter.js";
export { AnthropicProvider }    from "./providers/AnthropicProvider.js";
export { OpenAIShim }           from "./providers/OpenAIShim.js";
export type { ProviderConfig, Provider } from "./providers/ProviderInterface.js";

// ── Settings + system prompt ──────────────────────────────────────────────────
export { resolveSettings }      from "./state/Settings.js";
export type { CoworkSettings }  from "./state/Settings.js";
export { SYSTEM_PROMPT, assembleSystemPrompt } from "./state/SystemContext.js";

// ── Memory ────────────────────────────────────────────────────────────────────
export { MemorySystem }         from "./memdir/MemorySystem.js";
export type { MemorySystemOptions } from "./memdir/MemorySystem.js";
export { AutoDream }            from "./memdir/AutoDream.js";
export type { MemoryEntry, MemoryType } from "./memdir/MemoryTypes.js";

// ── Compression ───────────────────────────────────────────────────────────────
export { ContextCompressor }    from "./services/compact/ContextCompressor.js";

// ── Permissions ───────────────────────────────────────────────────────────────
export { PermissionGate }       from "./permissions/PermissionGate.js";
export { PermissionLevel }      from "./permissions/PermissionLevel.js";

// ── Slash commands ─────────────────────────────────────────────────────────────
export { defaultRegistry, SlashRegistry } from "./commands/registry.js";
export type { SlashCommand, SlashCommandContext } from "./commands/SlashCommand.js";

// ── Phase 5: MCP ──────────────────────────────────────────────────────────────
export { McpClient, buildMcpTools, mcpToolToDefinition } from "./mcp/index.js";
export type { McpServerConfig, McpTransport, McpToolSchema } from "./mcp/index.js";

// ── Phase 5: Hooks ────────────────────────────────────────────────────────────
export { HookRegistry }         from "./hooks/index.js";
export type {
  HookName, HookFn, HookMap,
  PreToolHookContext, PostToolHookContext,
  OnTurnHookContext, OnCompleteHookContext,
  OnEventHookContext
} from "./hooks/index.js";

// ── Phase 5: Skills ───────────────────────────────────────────────────────────
export { SkillRegistry }        from "./skills/index.js";
export type { Skill, SkillInvocation } from "./skills/index.js";

// ── Phase 5: Session manager ──────────────────────────────────────────────────
export { SessionManager }       from "./session/index.js";
export type { SessionRecord, SessionStatus } from "./session/index.js";
