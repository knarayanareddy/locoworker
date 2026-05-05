// packages/core/src/queryLoop.ts
// The agent loop — patched for Phase 5:
//   1) finalText accumulates across ALL turns (not reset per tool call)
//   2) HookRegistry integration (pre-tool, post-tool, on-turn, on-complete, on-event)

import type { Message, AgentEvent } from "./types.js";
import type { QueryEngine } from "./QueryEngine.js";
import type { ToolDefinition, ExecutionContext } from "./Tool.js";
import { PermissionGate } from "./permissions/PermissionGate.js";
import { PermissionLevel } from "./permissions/PermissionLevel.js";
import type { ContextCompressor } from "./services/compact/ContextCompressor.js";
import type { HookRegistry } from "./hooks/HookRegistry.js";

import type { ResolvedSettings } from "./state/Settings.js";

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
  sessionId?: string;
  workingDirectory?: string;
  settings?: ResolvedSettings;
  /** Optional initial history to resume a session */
  history?: Message[];
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
    permissionLevel = PermissionLevel.STANDARD,
    requestApproval,
    abortSignal,
    compressor,
    hooks,
  } = config;

  const history: Message[] = config.history ? [...config.history] : [{ role: "user", content: userInput }];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  // ── PHASE 5 FIX: finalText accumulates across all turns ─────────────────
  let finalText = "";

  const hookCtx = {
    sessionId: config.sessionId ?? "unknown",
    workingDirectory: config.workingDirectory ?? process.cwd(),
    turnIndex: 0,
    finalText,
    totalInputTokens,
    totalOutputTokens,
  };

  for (let turn = 0; turn < maxTurns; turn++) {
    if (abortSignal?.aborted) break;

    const estimatedTokens = estimateTokens(history);

    hookCtx.turnIndex = turn;
    hookCtx.finalText = finalText;
    hookCtx.totalInputTokens = totalInputTokens;
    hookCtx.totalOutputTokens = totalOutputTokens;

    if (hooks) {
      await hooks.runOnTurn(hookCtx);
    }

    if (compressor?.shouldAutoCompact(estimatedTokens)) {
      const compacted = await compressor.autoCompact(history);
      if (compacted) {
        history.length = 0;
        history.push(...compacted);
        const newTokens = estimateTokens(compacted);
        const ev: AgentEvent = { type: "compact", before: estimatedTokens, after: newTokens };
        if (hooks) await hooks.runOnEvent(ev, hookCtx);
        yield ev;
      }
    }

    const tsEv: AgentEvent = { type: "turn_start", turn };
    if (hooks) await hooks.runOnEvent(tsEv, hookCtx);
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
      const err = e instanceof Error ? e : new Error(String(e));
      const ev: AgentEvent = { type: "error", message: err.message };
      if (hooks) {
        await hooks.runOnError(err, hookCtx);
        await hooks.runOnEvent(ev, hookCtx);
      }
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
        if (hooks) await hooks.runOnEvent(ev, hookCtx);
        yield ev;
      } else if (block.type === "tool_use") {
        const ev: AgentEvent = { type: "tool_call", id: block.id, name: block.name, input: block.input };
        if (hooks) await hooks.runOnEvent(ev, hookCtx);
        yield ev;
      }
    }

    history.push({ role: "assistant", content: assistantBlocks });

    if (modelResponse.stopReason !== "tool_use") {
      hookCtx.finalText = finalText;
      hookCtx.totalInputTokens = totalInputTokens;
      hookCtx.totalOutputTokens = totalOutputTokens;
      
      if (hooks) {
        await hooks.runOnComplete(hookCtx);
      }
      const ev: AgentEvent = {
        type: "complete",
        text: finalText,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
      if (hooks) await hooks.runOnEvent(ev, hookCtx);
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
        workingDirectory: config.workingDirectory ?? process.cwd(),
        permissionLevel,
        abortSignal,
        settings: config.settings,
        sessionId: config.sessionId,
      };

      const checkResult = PermissionGate.check(tool, execCtx);

      if (checkResult.allowed === false) {
        const ev: AgentEvent = { type: "permission_denied", tool: tool.name, reason: checkResult.reason };
        if (hooks) await hooks.runOnEvent(ev, hookCtx);
        yield ev;
        toolResultBlocks.push({ type: "tool_result", tool_use_id: toolBlock.id, content: checkResult.reason, is_error: true });
        continue;
      }

      if (checkResult.allowed === "needs_approval") {
        const reqEv: AgentEvent = { type: "permission_request", tool: tool.name, input: toolBlock.input };
        if (hooks) await hooks.runOnEvent(reqEv, hookCtx);
        yield reqEv;

        const approved = requestApproval ? await requestApproval(tool.name, toolBlock.input) : false;
        if (!approved) {
          const denyEv: AgentEvent = { type: "permission_denied", tool: tool.name, reason: "User denied approval" };
          if (hooks) await hooks.runOnEvent(denyEv, hookCtx);
          yield denyEv;
          toolResultBlocks.push({ type: "tool_result", tool_use_id: toolBlock.id, content: "User denied permission", is_error: true });
          continue;
        }
      }

      hookCtx.finalText = finalText;
      hookCtx.totalInputTokens = totalInputTokens;
      hookCtx.totalOutputTokens = totalOutputTokens;

      if (hooks) {
        await hooks.runPreTool(tool.name, toolBlock.input, hookCtx);
      }

      let result: { content: string; isError: boolean };
      try {
        result = await tool.execute(toolBlock.input, execCtx);
      } catch (e) {
        result = { content: `Unexpected error: ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }

      if (hooks) {
        await hooks.runPostTool(tool.name, toolBlock.input, result, hookCtx);
      }

      const outputContent = compressor ? compressor.micro(result.content) : result.content;

      const resultEv: AgentEvent = { type: "tool_result", id: toolBlock.id, name: tool.name, result: outputContent, isError: result.isError };
      if (hooks) await hooks.runOnEvent(resultEv, hookCtx);
      yield resultEv;

      toolResultBlocks.push({ type: "tool_result", tool_use_id: toolBlock.id, content: outputContent, is_error: result.isError });
    }

    history.push({ role: "user", content: toolResultBlocks });
  }

  hookCtx.finalText = finalText;
  hookCtx.totalInputTokens = totalInputTokens;
  hookCtx.totalOutputTokens = totalOutputTokens;

  const ev: AgentEvent = { type: "complete", text: finalText, usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens } };
  if (hooks) {
    await hooks.runOnComplete(hookCtx);
    await hooks.runOnEvent(ev, hookCtx);
  }
  yield ev;
}
