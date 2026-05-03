#!/usr/bin/env bun
import { queryLoop, resolveSettings } from "@cowork/core";
import { parseArgs, HELP } from "./args.js";
import { renderEvent } from "./render.js";
import { makeApproval } from "./approval.js";
import { runRepl } from "./repl.js";
import { buildSessionRuntime } from "./session.js";

const VERSION = "0.2.0";

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`cowork ${VERSION}\n`);
    return 0;
  }

  const settings = await resolveSettings(process.cwd(), process.env, {
    provider: args.provider,
    model: args.model,
    permissionMode: args.permissionMode,
    maxTurns: args.maxTurns,
  });

  if (!args.prompt) {
    await runRepl(settings, { yes: args.yes, json: args.json });
    return 0;
  }

  const runtime = await buildSessionRuntime(settings);
  const approval = makeApproval({ autoApprove: args.yes });

  if (settings.persistTranscripts) {
    await runtime.memory.appendTranscript(runtime.sessionId, "user", args.prompt);
  }
  let assistantBuffer = "";

  for await (const event of queryLoop(args.prompt, {
    engine: runtime.engine,
    tools: runtime.tools,
    systemPrompt: runtime.systemPrompt,
    workingDirectory: settings.workingDirectory,
    permissionLevel: settings.permissionLevel,
    maxTurns: settings.maxTurns,
    maxTokens: settings.maxTokens,
    requestApproval: approval,
    compressor: runtime.compressor,
  })) {
    renderEvent(event, { json: args.json });
    if (event.type === "text") assistantBuffer += event.text;
    if (event.type === "error") return 1;
  }

  if (settings.persistTranscripts && assistantBuffer.trim()) {
    await runtime.memory.appendTranscript(runtime.sessionId, "assistant", assistantBuffer);
  }

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      `\x1b[31mfatal: ${e instanceof Error ? e.message : String(e)}\x1b[0m\n`,
    );
    process.exit(1);
  });
