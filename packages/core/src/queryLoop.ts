// packages/core/src/queryLoop.ts
// The agent loop.
//   - Only the final assistant turn is returned as the answer (`complete.text`).
//   - HookRegistry integration (pre-tool, post-tool, on-turn, on-complete, on-event).
//   - A shared AgentPolicy can be inherited by nested agent loops.

import type { Message, AgentEvent } from "./types.js";
import type { QueryEngine } from "./QueryEngine.js";
import type { ToolDefinition, ExecutionContext } from "./Tool.js";
import { PermissionGate } from "./permissions/PermissionGate.js";
import { executeTool } from "./tools/executeTool.js";
import { PermissionLevel } from "./permissions/PermissionLevel.js";
import type { ContextCompressor } from "./services/compact/ContextCompressor.js";
import type { HookRegistry } from "./hooks/HookRegistry.js";

import type { ResolvedSettings } from "./state/Settings.js";
import type { AgentPolicy, ApprovalFn } from "./policy/AgentPolicy.js";
import { applyAgentPolicy, getDefaultAgentPolicy } from "./policy/AgentPolicy.js";

export interface QueryLoopConfig {
  engine: QueryEngine;
  systemPrompt: string;
  tools?: ToolDefinition[];
  maxTurns?: number;
  maxTokens?: number;
  permissionLevel?: PermissionLevel;
  requestApproval?: ApprovalFn;
  abortSignal?: AbortSignal;
  compressor?: ContextCompressor;
  hooks?: HookRegistry;
  sessionId?: string;
  workingDirectory?: string;
  settings?: ResolvedSettings;
  /** Optional initial history to resume a session */
  history?: Message[];
  /** Shared policy inherited by nested agent loops. */
  policy?: AgentPolicy;
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
  const policy = config.policy ?? getDefaultAgentPolicy();
  // Inherit policy only for fields the caller did not set explicitly.
  const merged = applyAgentPolicy(config, policy);
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
  } = merged;
  const settings = merged.settings;
  const workingDirectory = merged.workingDirectory ?? process.cwd();
  const sessionId = merged.sessionId;

  // When history is supplied it is authoritative: the caller is responsible
  // for appending the current user message. userInput is only used for a
  // fresh conversation.
  const history: Message[] = config.history ? [...config.history] : [{ role: "user", content: userInput }];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  // Only the final assistant turn (the one without tool_use) is the answer.
  // Intermediate commentary must not leak into transcripts, session summaries
  // or gateway replies.
  let finalText = "";
  let turnText = "";

  const hookCtx = {
    sessionId: sessionId ?? "unknown",
    workingDirectory,
    turnIndex: 0,
    finalText,
    totalInputTokens,
    totalOutputTokens,
  };

  for (let turn = 0; turn < maxTurns; turn++) {
    if (abortSignal?.aborted) break;

    turnText = "";
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
        turnText += block.text;
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
      finalText = turnText;
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
        workingDirectory,
        permissionLevel,
        abortSignal,
        settings,
        sessionId,
      };

      // Every tool call goes through the one hardened choke point: schema
      // validation, permission gate, approval, then execution.
      const outcome = await executeTool(tool, toolBlock.input, execCtx, {
        approve: requestApproval,
        onPreTool: async (name, input) => {
          hookCtx.finalText = finalText;
          hookCtx.totalInputTokens = totalInputTokens;
          hookCtx.totalOutputTokens = totalOutputTokens;
          if (hooks) await hooks.runPreTool(name, input, hookCtx);
        },
        onPostTool: async (name, input, toolResult) => {
          if (hooks) await hooks.runPostTool(name, input, toolResult, hookCtx);
        },
        transformResult: compressor ? (content) => compressor.micro(content) : undefined,
      });

      // Replay decisions to the UI / hooks in the order they were made.
      for (const decision of outcome.events) {
        const ev: AgentEvent =
          decision.type === "invalid_input"
            ? { type: "tool_result", id: toolBlock.id, name: tool.name, result: decision.reason, isError: true }
            : decision.type === "permission_denied"
              ? { type: "permission_denied", tool: decision.tool, reason: decision.reason }
              : { type: "permission_request", tool: decision.tool, input: decision.input };
        if (hooks) await hooks.runOnEvent(ev, hookCtx);
        yield ev;
      }

      if (
        outcome.stage === "invalid_input" ||
        outcome.stage === "permission_denied" ||
        outcome.stage === "approval_denied"
      ) {
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: outcome.result.content,
          is_error: true,
        });
        continue;
      }

      const result = outcome.result;
      const outputContent = result.content;

      const resultEv: AgentEvent = { type: "tool_result", id: toolBlock.id, name: tool.name, result: outputContent, isError: result.isError };
      if (hooks) await hooks.runOnEvent(resultEv, hookCtx);
      yield resultEv;

      toolResultBlocks.push({ type: "tool_result", tool_use_id: toolBlock.id, content: outputContent, is_error: result.isError });
    }

    history.push({ role: "user", content: toolResultBlocks });
  }

  if (!finalText) finalText = turnText; // loop ended on max-turns without a final turn
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
