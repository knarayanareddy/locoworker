// apps/cowork-cli/src/repl.ts
// PHASE 5: passes sessionManager + skills into slash command context.
// Also adds `runTurn` to SlashCommandContext.

import * as readline from "node:readline";
import { queryLoop } from "@cowork/core";
import { defaultRegistry } from "@cowork/core/commands";
import type { SlashCommandContext } from "@cowork/core/commands";
import { renderEvent } from "./render.js";
import type { SessionRuntime } from "./session.js";
import type { CoworkSettings } from "@cowork/core";

export async function runRepl(
  settings: ReturnType<typeof import("@cowork/core").resolveSettings>,
  opts: { yes: boolean; json: boolean },
  runtime: SessionRuntime
): Promise<void> {
  const { engine, memory, compressor, sessionManager, skills, hooks } = runtime;
  let { tools, systemPrompt } = runtime;

  const registry = defaultRegistry();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: "\n\x1b[36mcowork>\x1b[0m ",
  });

  rl.prompt();

  const runTurn = async (prompt: string): Promise<void> => {
    for await (const event of queryLoop(prompt, {
      engine,
      systemPrompt,
      tools,
      maxTurns: settings.maxTurns,
      maxTokens: settings.maxTokens,
      permissionLevel: settings.permissionLevel,
      requestApproval: opts.yes
        ? async () => true
        : async (name, input) => {
            process.stdout.write(
              `\n\x1b[33m[approval]\x1b[0m Allow \x1b[1m${name}\x1b[0m? Input: ${JSON.stringify(input).slice(0, 120)}\n[y/N] `
            );
            return new Promise((resolve) => {
              const handler = (line: string) => {
                rl.off("line", handler);
                resolve(line.trim().toLowerCase() === "y");
              };
              rl.on("line", handler);
            });
          },
      compressor,
      hooks,
    })) {
      renderEvent(event, opts.json);

      if (event.type === "complete") {
        await memory.appendTranscript(runtime.sessionId, "user", prompt);
        await memory.appendTranscript(runtime.sessionId, "assistant", event.text);
        // Refresh system prompt so memory index reflects new saves
        systemPrompt = await runtime.refreshSystemPrompt();
      }
    }
  };

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); continue; }

    const ctx: SlashCommandContext = {
      sessionId: runtime.sessionId,
      workingDirectory: settings.workingDirectory ?? process.cwd(),
      memory,
      engine,
      compressor,
      sessionManager,
      skills,
      print: (msg) => console.log(msg),
      runTurn,
    };

    if (trimmed.startsWith("/")) {
      await registry.dispatch(trimmed, ctx);
    } else {
      await runTurn(trimmed);
    }

    rl.prompt();
  }

  // Disconnect MCP clients on exit
  for (const client of runtime.mcpClients) {
    await client.disconnect().catch(() => {});
  }
}
