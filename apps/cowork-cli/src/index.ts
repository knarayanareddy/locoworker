// apps/cowork-cli/src/index.ts — one-shot and REPL entry point.

import { parseArgs, HELP } from "./args.js";
import { buildSessionRuntime } from "./session.js";
import { runRepl } from "./repl.js";
import { renderEvent } from "./render.js";
import { resolveSettings, queryLoop, defaultRegistry } from "@cowork/core";
import type { Message } from "@cowork/core";
import { readFile } from "node:fs/promises";
import type { McpServerConfig } from "@cowork/core/mcp";
import type { Settings } from "@cowork/core";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (parsed.help)    { console.log(HELP); process.exit(0); }
  if (parsed.version) { console.log(`cowork v${VERSION}`); process.exit(0); }
  if (parsed.unknownFlags.length > 0) {
    console.error(`[error] Unknown or invalid option(s): ${parsed.unknownFlags.join(", ")}`);
    console.error("Run `cowork --help` for the supported flags.");
    process.exit(2);
  }

  let mcpServers: McpServerConfig[] = [];
  if (parsed.mcpConfig) {
    try {
      const raw = await readFile(parsed.mcpConfig, "utf8");
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) throw new Error("MCP config must be a JSON array");
      mcpServers = value as McpServerConfig[];
    } catch (e) {
      console.error(`[error] Could not read MCP config "${parsed.mcpConfig}": ${e}`);
      process.exit(1);
    }
  }

  const overrides: Partial<Settings> = { mcpServers };
  if (parsed.provider) overrides.provider = parsed.provider as Settings["provider"];
  if (parsed.model) overrides.model = parsed.model;
  if (parsed.permission) overrides.permissionMode = parsed.permission as Settings["permissionMode"];
  if (parsed.maxTurns) overrides.maxTurns = parsed.maxTurns;
  if (parsed.sandbox) overrides.sandboxMode = parsed.sandbox as Settings["sandboxMode"];
  if (parsed.enableGraphify) overrides.enableGraphify = true;
  if (process.env.COWORK_EMBEDDER_API_KEY) overrides.embedderApiKey = process.env.COWORK_EMBEDDER_API_KEY;

  const settings = await resolveSettings(process.cwd(), process.env, overrides);
  const runtime = await buildSessionRuntime(settings, {
    resume: parsed.resume,
    yes: parsed.yes,
  });

  if (parsed.sessionName) {
    await runtime.sessionManager.update(runtime.sessionId, { name: parsed.sessionName });
  }

  try {
    if (!parsed.prompt) {
      await runRepl(settings, { yes: parsed.yes, json: parsed.json }, runtime);
      return;
    }

    // ── Slash command dispatch ────────────────────────────────────────────
    let finalPrompt = parsed.prompt;
    if (finalPrompt.startsWith("/")) {
      let triggeredPrompt = "";
      const registry = defaultRegistry();
      const ctx = {
        memory: runtime.memory,
        engine: runtime.engine,
        compressor: runtime.compressor,
        sessionId: runtime.sessionId,
        workingDirectory: settings.workingDirectory,
        settings,
        policy: runtime.policy,
        hooks: runtime.hooks,
        runTurn: async (p: string) => { triggeredPrompt = p; },
        skills: runtime.skills,
        sessionManager: runtime.sessionManager,
        print: (msg: string) => process.stdout.write(msg + "\n"),
      };
      const handled = await registry.dispatch(finalPrompt, ctx);
      if (handled) {
        if (!triggeredPrompt) return;
        finalPrompt = triggeredPrompt;
      }
    }

    await runtime.memory.appendTranscript(runtime.sessionId, [
      { role: "user", content: finalPrompt },
    ]);

    // queryLoop ignores userInput when history is supplied, so the current
    // prompt must be the last entry of a resumed history.
    const history: Message[] | undefined = runtime.resumeHistory.length > 0
      ? [...runtime.resumeHistory, { role: "user", content: finalPrompt }]
      : undefined;

    let assistantBuffer = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of queryLoop(finalPrompt, {
      engine: runtime.engine,
      systemPrompt: runtime.systemPrompt,
      tools: runtime.tools,
      compressor: runtime.compressor,
      history,
      // The policy carries permissions, approvals, settings, hooks, cwd,
      // session id, token and turn limits into this loop and all nested loops.
      policy: runtime.policy,
    })) {
      renderEvent(event, { json: parsed.json });
      if (event.type === "complete") {
        assistantBuffer = event.text;
        inputTokens = event.usage?.inputTokens ?? 0;
        outputTokens = event.usage?.outputTokens ?? 0;
      }
    }

    if (assistantBuffer) {
      await runtime.memory.appendTranscript(runtime.sessionId, [
        { role: "assistant", content: assistantBuffer },
      ]);
    }
    await runtime.sessionManager.update(runtime.sessionId, {
      status: "complete",
      summary: assistantBuffer.slice(0, 500),
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
    });
  } finally {
    await runtime.shutdown();
  }
}

main().catch((e) => {
  console.error("[fatal]", e instanceof Error ? e.message : e);
  process.exit(1);
});
