import { createInterface } from "node:readline/promises";
import {
  defaultRegistry,
  queryLoop,
  type ResolvedSettings,
  type SlashCommandContext,
  type SlashOutput,
} from "@cowork/core";
import { renderEvent } from "./render.js";
import { makeApproval } from "./approval.js";
import { buildSessionRuntime, refreshSystemPrompt, type SessionRuntime } from "./session.js";

export async function runRepl(
  settings: ResolvedSettings,
  opts: { yes: boolean; json: boolean },
): Promise<void> {
  const runtime = await buildSessionRuntime(settings);
  const registry = defaultRegistry();
  const approval = makeApproval({ autoApprove: opts.yes });

  process.stdout.write(
    `\x1b[36mlocoworker\x1b[0m · ${runtime.engine.providerName}/${runtime.engine.model} · ${settings.permissionMode} · session ${runtime.sessionId}\n` +
      `\x1b[2mtype your prompt, /help for commands\x1b[0m\n\n`,
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  while (true) {
    const line = (await rl.question("» ")).trim();
    if (!line) continue;

    if (line.startsWith("/")) {
      const slashCtx: SlashCommandContext = {
        memory: runtime.memory,
        engine: runtime.engine,
        compressor: runtime.compressor,
        sessionId: runtime.sessionId,
        workingDirectory: settings.workingDirectory,
      };
      const result = await registry.dispatch(line, slashCtx);
      if (result) {
        const handled = await handleSlashOutput(result);
        if (handled === "exit") break;
        await refreshSystemPrompt(runtime, settings);
      }
      continue;
    }

    await runUserTurn(line, runtime, settings, approval, opts);
    await refreshSystemPrompt(runtime, settings);
  }

  rl.close();
}

async function handleSlashOutput(output: SlashOutput): Promise<"exit" | "ok"> {
  switch (output.type) {
    case "exit":
      return "exit";
    case "clear":
      process.stdout.write("\x1b[2J\x1b[H");
      return "ok";
    case "text":
      process.stdout.write(output.text + "\n");
      return "ok";
  }
}

async function runUserTurn(
  prompt: string,
  runtime: SessionRuntime,
  settings: ResolvedSettings,
  approval: ReturnType<typeof makeApproval>,
  opts: { json: boolean },
): Promise<void> {
  if (settings.persistTranscripts) {
    await runtime.memory.appendTranscript(runtime.sessionId, "user", prompt);
  }

  let assistantBuffer = "";

  for await (const event of queryLoop(prompt, {
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
    renderEvent(event, { json: opts.json });
    if (event.type === "text") assistantBuffer += event.text;
    if (event.type === "complete" && settings.persistTranscripts && assistantBuffer.trim()) {
      await runtime.memory.appendTranscript(runtime.sessionId, "assistant", assistantBuffer);
    }
  }
  process.stdout.write("\n");
}
