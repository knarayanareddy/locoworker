// packages/core/src/queryLoop.ts
// The agent loop — patched for Phase 5:
//   1) finalText accumulates across ALL turns (not reset per tool call)
//   2) HookRegistry integration (pre-tool, post-tool, on-turn, on-complete, on-event)

import type { Message, AgentEvent } from "./types.js";
import type { QueryEngine } from "./QueryEngine.js";
import type { ToolDefinition, ExecutionContext } from "./Tool.js";
import { PermissionGate } from "./permissions/PermissionGate.js";
import type { PermissionLevel } from "./permissions/PermissionLevel.js";
import type { ContextCompressor } from "./services/compact/ContextCompressor.js";
import type { HookRegistry } from "./hooks/HookRegistry.js";

export interface QueryLoopConfig {
  engine: QueryEngine;
  systemPrompt: string;
  tools?: ToolDefinition[];
  maxTurns?: number;
  maxTokens?: number;
  permissionLevel?: PermissionLevel;
  requestApproval?: (toolName: string, input: unknown) => Promise<boolean>;
  abortSignal?: AbortSignal;
  compressor?: ContextCompressor;
  hooks?: HookRegistry;
}

function estimateTokens(messages: Message[]): number {
  let chars = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      chars += msg.content.length;
    } else {
      for (const block of msg.content) {
        if (block.type === "text") chars += block.text.length;
        else if (block.type === "tool_use") chars += JSON.stringify(block.input).length;
        else if (block.type === "tool_result") chars += block.content.length;
      }
    }
  }
  return Math.ceil(chars / 4);
}

export async function* queryLoop(
  userInput: string,
  config: QueryLoopConfig
): AsyncGenerator<AgentEvent> {
  const {
    engine,
    systemPrompt,
    tools = [],
    maxTurns = 50,
    maxTokens = 4096,
    permissionLevel,
    requestApproval,
    abortSignal,
    compressor,
    hooks,
  } = config;

  const gate = new PermissionGate(permissionLevel);
  const history: Message[] = [{ role: "user", content: userInput }];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  // ── PHASE 5 FIX: finalText accumulates across all turns ─────────────────
  let finalText = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    if (abortSignal?.aborted) break;

    const estimatedTokens = estimateTokens(history);

    if (hooks) {
      const ok = await hooks.run("on-turn", { turn, historyLength: history.length, estimatedTokens });
      if (!ok) break;
    }

    if (compressor?.shouldAutoCompact(estimatedTokens)) {
      const compacted = await compressor.autoCompact(history);
      if (compacted) {
        history.length = 0;
        history.push(...compacted);
        const ev: AgentEvent = { type: "compaction", summary: "[Context compacted]" };
        if (hooks) await hooks.run("on-event", { event: ev });
        yield ev;
      }
    }

    const tsEv: AgentEvent = { type: "turn_start", turn };
    if (hooks) await hooks.run("on-event", { event: tsEv });
    yield tsEv;

    let modelResponse: Awaited<ReturnType<typeof engine.call>>;
    try {
      modelResponse = await engine.call({
        systemPrompt,
        messages: history,
        tools,
        maxTokens,
        abortSignal
      });
    } catch (e) {
      const ev: AgentEvent = { type: "error", message: e instanceof Error ? e.message : String(e) };
      if (hooks) await hooks.run("on-event", { event: ev });
      yield ev;
      break;
    }

    totalInputTokens += modelResponse.usage?.inputTokens ?? 0;
    totalOutputTokens += modelResponse.usage?.outputTokens ?? 0;

    const assistantBlocks = Array.isArray(modelResponse.content)
      ? modelResponse.content
      : [{ type: "text" as const, text: String(modelResponse.content) }];

    for (const block of assistantBlocks) {
      if (block.type === "text") {
        finalText += block.text; // accumulate, never reset
        const ev: AgentEvent = { type: "text", text: block.text };
        if (hooks) await hooks.run("on-event", { event: ev });
        yield ev;
      } else if (block.type === "tool_use") {
        const ev: AgentEvent = { type: "tool_call", name: block.name, input: block.input, id: block.id };
        if (hooks) await hooks.run("on-event", { event: ev });
        yield ev;
      }
    }

    history.push({ role: "assistant", content: assistantBlocks });

    if (modelResponse.stopReason !== "tool_use") {
      if (hooks) {
        await hooks.run("on-complete", { turns: turn + 1, totalInputTokens, totalOutputTokens, finalText });
      }
      const ev: AgentEvent = {
        type: "complete",
        text: finalText,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
      if (hooks) await hooks.run("on-event", { event: ev });
      yield ev;
      return;
    }

    const toolUseBlocks = assistantBlocks.filter((b) => b.type === "tool_use") as Array<{ type: "tool_use", name: string, input: any, id: string }>;
    const toolResultBlocks: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];

    for (const toolBlock of toolUseBlocks) {
      const tool = tools.find((t) => t.name === toolBlock.name);

      if (!tool) {
        toolResultBlocks.push({ type: "tool_result", tool_use_id: toolBlock.id, content: `Error: tool "${toolBlock.name}" not found`, is_error: true });
        continue;
      }

      const execCtx: ExecutionContext = {
        workingDirectory: process.cwd(),
        permissionLevel: gate.sessionLevel,
        abortSignal,
      };

      const permission = gate.check(tool, execCtx);

      if (permission === "denied") {
        const ev: AgentEvent = { type: "permission_denied", toolName: tool.name, reason: "Permission level too low" };
        if (hooks) await hooks.run("on-event", { event: ev });
        yield ev;
        toolResultBlocks.push({ type: "tool_result", tool_use_id: toolBlock.id, content: "Permission denied", is_error: true });
        continue;
      }

      if (permission === "needs_approval") {
        const reqEv: AgentEvent = { type: "permission_request", toolName: tool.name, input: toolBlock.input };
        if (hooks) await hooks.run("on-event", { event: reqEv });
        yield reqEv;

        const approved = requestApproval ? await requestApproval(tool.name, toolBlock.input) : false;
        if (!approved) {
          const denyEv: AgentEvent = { type: "permission_denied", toolName: tool.name, reason: "User denied" };
          if (hooks) await hooks.run("on-event", { event: denyEv });
          yield denyEv;
          toolResultBlocks.push({ type: "tool_result", tool_use_id: toolBlock.id, content: "User denied permission", is_error: true });
          continue;
        }
      }

      if (hooks) {
        const proceed = await hooks.run("pre-tool", { toolName: tool.name, input: toolBlock.input, executionContext: execCtx });
        if (!proceed) {
          toolResultBlocks.push({ type: "tool_result", tool_use_id: toolBlock.id, content: "Cancelled by pre-tool hook", is_error: true });
          continue;
        }
      }

      const t0 = Date.now();
      let result: { content: string; isError: boolean };
      try {
        result = await tool.execute(toolBlock.input, execCtx);
      } catch (e) {
        result = { content: `Unexpected error: ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
      const durationMs = Date.now() - t0;

      if (hooks) {
        await hooks.run("post-tool", { toolName: tool.name, input: toolBlock.input, output: result, durationMs });
      }

      const outputContent = compressor ? compressor.micro(result.content) : result.content;

      const resultEv: AgentEvent = { type: "tool_result", name: tool.name, content: outputContent, isError: result.isError };
      if (hooks) await hooks.run("on-event", { event: resultEv });
      yield resultEv;

      toolResultBlocks.push({ type: "tool_result", tool_use_id: toolBlock.id, content: outputContent, is_error: result.isError });
    }

    history.push({ role: "user", content: toolResultBlocks });
  }

  const ev: AgentEvent = { type: "complete", text: finalText, usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens } };
  if (hooks) await hooks.run("on-event", { event: ev });
  yield ev;
}
