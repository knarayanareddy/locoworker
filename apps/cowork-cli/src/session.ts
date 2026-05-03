import { randomUUID } from "node:crypto";
import {
  ContextCompressor,
  DEFAULT_TOOLS,
  MemorySystem,
  QueryEngine,
  SYSTEM_PROMPT,
  assembleSystemPrompt,
  makeMemoryTools,
  resolveProvider,
  type Provider,
  type ResolvedSettings,
  type ToolDefinition,
} from "@cowork/core";

export type SessionRuntime = {
  sessionId: string;
  provider: Provider;
  engine: QueryEngine;
  memory: MemorySystem;
  compressor: ContextCompressor;
  tools: ToolDefinition[];
  systemPrompt: string;
};

/**
 * Wires every Phase 2 subsystem together for one CLI session.
 */
export async function buildSessionRuntime(settings: ResolvedSettings): Promise<SessionRuntime> {
  const provider = resolveProvider({
    provider: settings.provider,
    model: settings.model,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    env: process.env,
  });
  const engine = new QueryEngine(provider);

  const memory = new MemorySystem({
    projectRoot: settings.workingDirectory,
    embedderUrl: settings.embedderUrl,
    embedderModel: settings.embedderModel,
  });
  await memory.store.init();

  const compressor = new ContextCompressor(engine, {
    contextWindow: settings.contextWindow,
  });

  const sessionId = randomUUID().slice(0, 8);
  const memoryTools = makeMemoryTools(memory, sessionId);
  const tools: ToolDefinition[] = [...DEFAULT_TOOLS, ...memoryTools];

  const basePrompt = settings.systemPrompt ?? SYSTEM_PROMPT;
  const systemPrompt = settings.loadProjectContext
    ? await assembleSystemPrompt(basePrompt, settings.workingDirectory, memory)
    : basePrompt;

  return {
    sessionId,
    provider,
    engine,
    memory,
    compressor,
    tools,
    systemPrompt,
  };
}

/**
 * Refresh just the system prompt (e.g. after the agent saved a new memory
 * we want the next turn to see the updated index).
 */
export async function refreshSystemPrompt(
  runtime: SessionRuntime,
  settings: ResolvedSettings,
): Promise<string> {
  const basePrompt = settings.systemPrompt ?? SYSTEM_PROMPT;
  if (!settings.loadProjectContext) return basePrompt;
  const next = await assembleSystemPrompt(basePrompt, settings.workingDirectory, runtime.memory);
  runtime.systemPrompt = next;
  return next;
}
