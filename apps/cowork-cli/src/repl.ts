import * as readline from "node:readline";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { queryLoop, defaultRegistry, getCoworkHome } from "@cowork/core";
import type { Message, ResolvedSettings } from "@cowork/core";
import { join } from "node:path";
import { renderEvent } from "./render.js";
import type { SessionRuntime } from "./session.js";

const HISTORY_PATH = join(getCoworkHome(), "repl-history.txt");
const MAX_HISTORY = 1000;
const MAX_CONTEXT_MESSAGES = 40;

export async function runRepl(
  settings: ResolvedSettings,
  opts: { yes: boolean; json: boolean },
  runtime: SessionRuntime
): Promise<void> {
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

  process.stdout.write([
    ``,
    `  ╔═══════════════════════════════════════╗`,
    `  ║            locoworker REPL             ║`,
    `  ╚═══════════════════════════════════════╝`,
    ``,
    `  Provider : ${settings.provider}`,
    `  Model    : ${settings.model ?? "default"}`,
    `  Mode     : ${settings.permissionMode}`,
    `  Session  : ${runtime.sessionId}${runtime.resumeHistory.length ? " (resumed)" : ""}`,
    `  CWD      : ${settings.workingDirectory}`,
    `  Tools    : ${runtime.tools.length}`,
    ``,
    `  Type /help for commands. Ctrl+C or /exit to quit.`,
    ``,
  ].join("\n"));

  const registry = defaultRegistry();
  // Conversation context is kept in-process, seeded by --resume.
  let messages: Message[] = [...runtime.resumeHistory];

  async function runTurn(input: string): Promise<void> {
    const userMessage: Message = { role: "user", content: input };
    await runtime.memory.appendTranscript(runtime.sessionId, [userMessage]);
    messages.push(userMessage);
    const turnHistory: Message[] = messages.slice(-MAX_CONTEXT_MESSAGES);

    let assistantBuffer = "";
    for await (const event of queryLoop(input, {
      engine: runtime.engine,
      systemPrompt: runtime.systemPrompt,
      tools: runtime.tools,
      compressor: runtime.compressor,
      history: turnHistory,
      hooks: runtime.hooks,
      // Inherit permissions, approval callback, settings, cwd and limits.
      policy: runtime.policy,
      requestApproval: opts.yes ? async () => true : runtime.requestApproval,
    })) {
      renderEvent(event, { json: opts.json });
      if (event.type === "complete") assistantBuffer = event.text;
    }

    if (assistantBuffer) {
      const assistantMessage: Message = { role: "assistant", content: assistantBuffer };
      await runtime.memory.appendTranscript(runtime.sessionId, [assistantMessage]);
      messages.push(assistantMessage);
    }
    runtime.systemPrompt = await runtime.refreshSystemPrompt();
  }

  const makeContext = () => ({
    memory: runtime.memory,
    engine: runtime.engine,
    compressor: runtime.compressor,
    sessionId: runtime.sessionId,
    workingDirectory: settings.workingDirectory,
    settings,
    policy: runtime.policy,
    hooks: runtime.hooks,
    runTurn,
    skills: runtime.skills,
    sessionManager: runtime.sessionManager,
    print: (msg: string) => process.stdout.write(msg + "\n"),
  });

  rl.prompt();

  rl.on("line", async (rawLine) => {
    rl.pause();
    const line = rawLine.trim();
    if (!line) {
      rl.prompt();
      rl.resume();
      return;
    }

    await mkdir(dirname(HISTORY_PATH), { recursive: true }).catch(() => {});
    await appendFile(HISTORY_PATH, line + "\n", "utf-8").catch(() => {});

    if (line.endsWith("\\")) {
      process.stdout.write("  > ");
      rl.resume();
      return;
    }

    try {
      if (line.startsWith("/")) {
        await registry.dispatch(line, makeContext());
        if (line === "/clear") messages = [];
      } else {
        await runTurn(line);
      }
    } catch (err) {
      process.stdout.write(`\n  Error: ${err instanceof Error ? err.message : String(err)}\n\n`);
    }

    rl.setPrompt(buildPrompt(settings));
    rl.prompt();
    rl.resume();
  });

  rl.on("close", () => {
    process.stdout.write("\n  Goodbye.\n\n");
    void runtime.shutdown().finally(() => process.exit(0));
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
