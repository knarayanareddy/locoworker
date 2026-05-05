// apps/cowork-cli/src/index.ts
// PHASE 5: reads MCP config, passes --enable-graphify, names sessions,
// wires hooks and session manager into the one-shot path.

import { parseArgs, HELP } from "./args.js";
import { buildSessionRuntime } from "./session.js";
import { runRepl } from "./repl.js";
import { renderEvent } from "./render.js";
import { resolveSettings, queryLoop, defaultRegistry } from "@cowork/core";
import { readFile } from "node:fs/promises";
import type { McpServerConfig } from "@cowork/core/mcp";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (parsed.help)    { console.log(HELP); process.exit(0); }
  if (parsed.version) { console.log(`cowork v${VERSION}`); process.exit(0); }

  // ── Resolve settings ───────────────────────────────────────────────────────
  let mcpServers: McpServerConfig[] = [];
  if (parsed.mcpConfig) {
    try {
      const raw = await readFile(parsed.mcpConfig, "utf8");
      mcpServers = JSON.parse(raw) as McpServerConfig[];
    } catch (e) {
      console.error(`[error] Could not read MCP config "${parsed.mcpConfig}": ${e}`);
      process.exit(1);
    }
  }

  const overrides: Partial<import("@cowork/core").Settings> = { mcpServers };
  if (parsed.provider) overrides.provider = parsed.provider as any;
  if (parsed.model) overrides.model = parsed.model;
  if (parsed.permission) overrides.permissionMode = parsed.permission as any;
  if (parsed.maxTurns) overrides.maxTurns = parsed.maxTurns;
  if (parsed.enableGraphify) overrides.enableGraphify = parsed.enableGraphify;
  if (process.env["COWORK_EMBEDDER_API_KEY"]) overrides.embedderApiKey = process.env["COWORK_EMBEDDER_API_KEY"];

  const settings = await resolveSettings(process.cwd(), process.env as Record<string, string>, overrides);

  // ── Build runtime ──────────────────────────────────────────────────────────
  const runtime = await buildSessionRuntime(settings);

  // Apply --session name override
  if (parsed.sessionName) {
    await runtime.sessionManager.update(runtime.sessionId, { name: parsed.sessionName });
  }

  // ── REPL or one-shot ───────────────────────────────────────────────────────
  if (!parsed.prompt) {
    await runRepl(settings, { yes: parsed.yes, json: parsed.json }, runtime);
    return;
  }

  // One-shot mode
  const prompt = parsed.prompt;

  // ── Slash Command Dispatch ─────────────────────────────────────────────────
  if (prompt.startsWith("/")) {
    let triggeredPrompt = "";
    const registry = defaultRegistry();
    const ctx = {
      memory: runtime.memory,
      engine: runtime.engine,
      compressor: runtime.compressor,
      sessionId: runtime.sessionId,
      workingDirectory: settings.workingDirectory,
      runTurn: async (p: string) => { triggeredPrompt = p; },
      skills: runtime.skills,
      sessionManager: runtime.sessionManager,
      print: (msg: string) => process.stdout.write(msg + "\n"),
    };
    const handled = await registry.dispatch(prompt, ctx);
    if (handled) {
      if (!triggeredPrompt) return;
      // Continue execution with the generated prompt
      parsed.prompt = triggeredPrompt;
    }
  }

  const finalPrompt = parsed.prompt;
  await runtime.memory.appendTranscript(runtime.sessionId, [
    { role: "user", content: finalPrompt },
  ]);

  let assistantBuffer = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const event of queryLoop(finalPrompt, {
    engine:           runtime.engine,
    systemPrompt:     runtime.systemPrompt,
    tools:            runtime.tools,
    maxTurns:         settings.maxTurns,
    maxTokens:        settings.maxTokens,
    permissionLevel:  settings.permissionLevel,
    requestApproval:  parsed.yes ? async () => true : undefined,
    compressor:       runtime.compressor,
    hooks:            runtime.hooks,
    sessionId:        runtime.sessionId,
    workingDirectory: settings.workingDirectory,
    settings:         settings,
  })) {
    renderEvent(event, { json: !!parsed.json });

    if (event.type === "text")     assistantBuffer += event.text;
    if (event.type === "complete") {
      inputTokens  = event.usage?.inputTokens  ?? 0;
      outputTokens = event.usage?.outputTokens ?? 0;
    }
  }

  if (assistantBuffer) {
    await runtime.memory.appendTranscript(runtime.sessionId, [
      { role: "assistant", content: assistantBuffer },
    ]);
  }

  await runtime.sessionManager.update(runtime.sessionId, {
    status:            "complete",
    summary:           assistantBuffer.slice(0, 500),
    turns:             1,
    totalInputTokens:  inputTokens,
    totalOutputTokens: outputTokens,
  });

  // Disconnect MCP clients
  for (const client of runtime.mcpClients) {
    await client.disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error("[fatal]", e instanceof Error ? e.message : e);
  process.exit(1);
});
