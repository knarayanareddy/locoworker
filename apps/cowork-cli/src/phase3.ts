import type { SessionRuntime } from "./session.js";
import { KAIROSDaemon, defaultKairosTasks, type KairosConfig } from "@cowork/kairos";
import { WIKI_TOOLS } from "@cowork/wiki";
import { RESEARCH_TOOLS } from "@cowork/research";
import { ORCHESTRATOR_TOOLS } from "@cowork/orchestrator";
import { PluginManager, BUILTIN_PLUGINS } from "@cowork/plugins";
import { MCPRegistry, EXTENDED_TOOLS } from "@cowork/core";

export interface Phase3Runtime {
  daemon?: KAIROSDaemon;
  pluginManager: PluginManager;
  mcpRegistry: MCPRegistry;
}

export async function bootstrapPhase3(
  runtime: SessionRuntime,
  options: {
    enableDaemon?: boolean;
    enablePlugins?: boolean;
    enableMcp?: boolean;
    mcpServers?: Array<{
      name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }>;
  } = {}
): Promise<Phase3Runtime> {
  // ── 1. Extended tools ─────────────────────────────────────────────────────
  for (const tool of EXTENDED_TOOLS) {
    runtime.tools.push(tool);
  }

  // ── 2. Wiki + Research + Orchestrator tools ────────────────────────────────
  for (const tool of [...WIKI_TOOLS, ...RESEARCH_TOOLS, ...ORCHESTRATOR_TOOLS]) {
    runtime.tools.push(tool);
  }

  // ── 3. Plugin system ───────────────────────────────────────────────────────
  const pluginManager = new PluginManager((runtime.memory.store as any).rootPath ?? process.cwd()); 
  if (options.enablePlugins !== false) {
    await pluginManager.loadAll(BUILTIN_PLUGINS);
    for (const tool of pluginManager.getTools()) {
      runtime.tools.push(tool);
    }
  }

  // ── 4. MCP registry ────────────────────────────────────────────────────────
  const mcpRegistry = new MCPRegistry();
  if (options.enableMcp && options.mcpServers?.length) {
    for (const server of options.mcpServers) {
      try {
        await mcpRegistry.register({ ...server, transport: "stdio" });
        const mcpTools = await mcpRegistry.getAllTools();
        for (const tool of mcpTools) {
          runtime.tools.push(tool);
        }
      } catch (err) {
        console.warn(
          `[Phase3] MCP server "${server.name}" failed to connect:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  // ── 5. KAIROS daemon ───────────────────────────────────────────────────────
  let daemon: KAIROSDaemon | undefined;
  if (options.enableDaemon) {
    const kairosConfig: KairosConfig = {
      tickIntervalMs: 30_000,
      projectRoot: (runtime as any).workingDirectory ?? process.cwd(),
      provider: (runtime.provider as any).name ?? "anthropic",
      model: (runtime.provider as any).model ?? "claude-3-5-sonnet-20240620",
    };
    daemon = new KAIROSDaemon(kairosConfig);
    for (const task of defaultKairosTasks()) {
      daemon.register(task);
    }
    daemon.on("event", (e) => {
      // In a real CLI we might show a spinner or status bar
      if (e.type !== "tick") {
        // Silent by default unless verbose
      }
    });
    daemon.start();

    // Stop daemon on process exit
    process.on("exit", () => daemon?.stop());
    process.on("SIGINT", () => { daemon?.stop(); process.exit(0); });
  }

  return { daemon, pluginManager, mcpRegistry };
}
