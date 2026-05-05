import * as readline from "node:readline";
import { readFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { queryLoop, defaultRegistry, type ResolvedSettings } from "@cowork/core";
import { renderEvent } from "./render.js";
import type { SessionRuntime } from "./session.js";

const HISTORY_PATH = join(homedir(), ".cowork", "repl-history.txt");
const MAX_HISTORY = 1000;

export async function runRepl(
  settings: ResolvedSettings,
  opts: { yes: boolean; json: boolean },
  runtime: SessionRuntime
): Promise<void> {
  // Load history
  let history: string[] = [];
  try {
    const raw = await readFile(HISTORY_PATH, "utf-8");
    history = raw.split("\n").filter(Boolean).slice(-MAX_HISTORY);
  } catch {
    // history file doesn't exist yet
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    history,
    historySize: MAX_HISTORY,
    removeHistoryDuplicates: true,
    prompt: buildPrompt(settings),
  });

  // Banner
  const banner = [
    ``,
    `  ╔═══════════════════════════════════════╗`,
    `  ║      locoworker  (Phase 6 REPL)       ║`,
    `  ╚═══════════════════════════════════════╝`,
    ``,
    `  Provider : ${settings.provider}`,
    `  Model    : ${settings.model ?? "default"}`,
    `  Mode     : ${settings.permissionMode}`,
    `  Session  : ${runtime.sessionId}`,
    `  CWD      : ${settings.workingDirectory}`,
    ``,
    `  Type /help for commands. Ctrl+C or /exit to quit.`,
    ``,
  ].join("\n");
  process.stdout.write(banner);

  const registry = defaultRegistry();

  async function runTurn(input: string): Promise<void> {
    let assistantBuffer = "";

    await runtime.memory.appendTranscript(runtime.sessionId, [
      { role: "user", content: input },
    ]);

    for await (const event of queryLoop(input, {
      engine: runtime.engine,
      systemPrompt: runtime.systemPrompt,
      tools: runtime.tools,
      maxTokens: settings.maxTokens,
      maxTurns: settings.maxTurns,
      compressor: runtime.compressor,
      requestApproval: async (toolName, toolInput) => {
        return new Promise((resolve) => {
          if (opts.yes) return resolve(true);
          const summary = JSON.stringify(toolInput).slice(0, 120);
          rl.question(
            `\n  ⚠  Allow "${toolName}" (${summary})? [y/N] `,
            (answer) => resolve(answer.trim().toLowerCase() === "y")
          );
        });
      },
      hooks: runtime.hooks,
      sessionId: runtime.sessionId,
      workingDirectory: settings.workingDirectory,
    })) {
      renderEvent(event, { json: opts.json });
      if (event.type === "text") assistantBuffer += event.text;
    }

    if (assistantBuffer) {
      await runtime.memory.appendTranscript(runtime.sessionId, [
        { role: "assistant", content: assistantBuffer },
      ]);
    }

    // Refresh system prompt (picks up any MEMORY.md changes from this turn)
    runtime.systemPrompt = await runtime.refreshSystemPrompt();
  }

  rl.prompt();

  rl.on("line", async (rawLine) => {
    rl.pause();
    const line = rawLine.trim();

    if (!line) {
      rl.prompt();
      rl.resume();
      return;
    }

    // Persist to history file
    await appendFile(HISTORY_PATH, line + "\n", "utf-8").catch(() => {});

    // Multi-line input: lines ending with \ continue
    if (line.endsWith("\\")) {
      process.stdout.write("  > ");
      rl.resume();
      return;
    }

    try {
      if (line.startsWith("/")) {
        // Slash command
        const [cmdName, ...rest] = line.slice(1).split(" ");
        const ctx = {
          memory: runtime.memory,
          engine: runtime.engine,
          compressor: runtime.compressor,
          sessionId: runtime.sessionId,
          workingDirectory: settings.workingDirectory,
          runTurn,
          skills: runtime.skills,
          sessionManager: runtime.sessionManager,
          print: (msg: string) => process.stdout.write(msg + "\n"),
        };

        await registry.dispatch(line, ctx);
      } else {
        await runTurn(line);
      }
    } catch (err) {
      process.stdout.write(
        `\n  Error: ${err instanceof Error ? err.message : String(err)}\n\n`
      );
    }

    rl.setPrompt(buildPrompt(settings));
    rl.prompt();
    rl.resume();
  });

  rl.on("close", () => {
    process.stdout.write("\n  Goodbye.\n\n");
    // Disconnect MCP clients
    for (const client of runtime.mcpClients) {
      client.disconnect().catch(() => {});
    }
    process.exit(0);
  });

  rl.on("SIGINT", () => {
    process.stdout.write("\n  (Use /exit or Ctrl+D to quit)\n\n");
    rl.prompt();
  });
}

function buildPrompt(settings: ResolvedSettings): string {
  const model = (settings.model ?? "").split(":")[0]?.split("/").pop()?.slice(0, 12) ?? "?";
  const mode = settings.permissionMode.slice(0, 3);
  return `  [${model}|${mode}] cowork> `;
}
