// apps/cowork-cli/src/session.ts
// PHASE 5: wires MCP tools, Graphify tools, HookRegistry, SessionManager, SkillRegistry.

import { resolve } from "node:path";
import {
  resolveProvider,
  QueryEngine,
  MemorySystem,
  ContextCompressor,
  DEFAULT_TOOLS,
  makeMemoryTools,
  SYSTEM_PROMPT,
  assembleSystemPrompt,
  resolveSettings,
} from "@cowork/core";
import type { ToolDefinition } from "@cowork/core";
import { HookRegistry } from "@cowork/core/hooks";
import { SessionManager } from "@cowork/core/session";
import { SkillRegistry } from "@cowork/core/skills";
import { buildMcpTools } from "@cowork/core/mcp";
import type { McpServerConfig } from "@cowork/core/mcp";
import type { CoworkSettings } from "@cowork/core";

// Import Graphify tools from core (they now safely lazy-init)
import { GraphifyBuildTool, GraphifyQueryTool, GraphifySession } from "@cowork/core/tools/graphify";

export interface SessionRuntime {
  engine: QueryEngine;
  memory: MemorySystem;
  compressor: ContextCompressor;
  tools: ToolDefinition[];
  systemPrompt: string;
  sessionId: string;
  sessionManager: SessionManager;
  skills: SkillRegistry;
  hooks: HookRegistry;
  mcpClients: Awaited<ReturnType<typeof buildMcpTools>>["clients"];
  refreshSystemPrompt: () => Promise<string>;
}

function generateSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function buildSessionRuntime(
  settings: ReturnType<typeof resolveSettings>
): Promise<SessionRuntime> {
  const cwd = resolve(settings.workingDirectory ?? process.cwd());

  // ── Core subsystems ────────────────────────────────────────────────────────
  const provider = resolveProvider({
    provider: settings.provider,
    model: settings.model,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    env: process.env as Record<string, string>,
  });

  const engine = new QueryEngine(provider);

  const memory = new MemorySystem({
    projectRoot: cwd,
    embedderUrl: settings.embedderUrl,
    embedderModel: settings.embedderModel,
    embedderApiKey: settings.embedderApiKey, // PHASE 5 FIX
  });
  await memory.store.init();

  const compressor = new ContextCompressor(engine, {
    contextWindow: settings.contextWindow,
  });

  const sessionId = generateSessionId();

  // ── Session manager ────────────────────────────────────────────────────────
  const sessionManager = new SessionManager(cwd);
  await sessionManager.init();
  await sessionManager.create(sessionId, {
    name: `Session ${new Date().toLocaleTimeString()}`,
    projectRoot: cwd,
    provider: settings.provider ?? "ollama",
    model: settings.model ?? "default",
  });

  // ── Skills ─────────────────────────────────────────────────────────────────
  const skills = new SkillRegistry(cwd);
  await skills.load();

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const hooks = new HookRegistry();

  // Default hook: update session record on completion
  hooks.on("on-complete", async (ctx) => {
    await sessionManager.update(sessionId, {
      status: "completed",
      totalInputTokens: ctx.totalInputTokens,
      totalOutputTokens: ctx.totalOutputTokens,
      turns: ctx.turns,
      summary: ctx.finalText.slice(0, 500),
    });
  });

  // ── MCP tools ──────────────────────────────────────────────────────────────
  const mcpConfigs: McpServerConfig[] = settings.mcpServers ?? [];
  const { tools: mcpTools, clients: mcpClients } = mcpConfigs.length > 0
    ? await buildMcpTools(mcpConfigs)
    : { tools: [], clients: [] };

  // ── Graphify tools ─────────────────────────────────────────────────────────
  let graphifyTools: ToolDefinition[] = [];
  if (settings.enableGraphify) {
    const graphifySession = new GraphifySession(cwd);
    graphifyTools = [
      new GraphifyBuildTool(graphifySession),
      new GraphifyQueryTool(graphifySession),
    ];
  }

  // ── Full tool list ─────────────────────────────────────────────────────────
  const tools: ToolDefinition[] = [
    ...DEFAULT_TOOLS,
    ...makeMemoryTools(memory, sessionId),
    ...graphifyTools,
    ...mcpTools,
  ];

  // ── System prompt ──────────────────────────────────────────────────────────
  const buildSystemPrompt = async (): Promise<string> => {
    if (settings.loadProjectContext) {
      return assembleSystemPrompt(SYSTEM_PROMPT, cwd, memory);
    }
    return SYSTEM_PROMPT;
  };

  const systemPrompt = await buildSystemPrompt();

  return {
    engine,
    memory,
    compressor,
    tools,
    systemPrompt,
    sessionId,
    sessionManager,
    skills,
    hooks,
    mcpClients,
    refreshSystemPrompt: buildSystemPrompt,
  };
}
