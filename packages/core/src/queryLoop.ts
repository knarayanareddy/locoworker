import { QueryEngine } from "./QueryEngine.js";
import { PermissionGate } from "./permissions/PermissionGate.js";
import { buildToolMap } from "./tools/index.js";
import {
  ContextCompressor,
  estimateTokens,
} from "./services/compact/ContextCompressor.js";
import type { ToolDefinition, ExecutionContext, ToolResult } from "./Tool.js";
import type { PermissionLevel } from "./permissions/PermissionLevel.js";
import type {
  AgentEvent,
  ContentBlock,
  Message,
  ToolUseBlock,
  ToolResultBlock,
} from "./types.js";

export type AgentLoopConfig = {
  engine: QueryEngine;
  tools: ToolDefinition[];
  systemPrompt: string;
  workingDirectory: string;
  permissionLevel: PermissionLevel;
  maxTurns?: number;
  maxTokens?: number;
  requestApproval?: (toolName: string, input: Record<string, unknown>) => Promise<boolean>;
  abortSignal?: AbortSignal;
  /** Optional. When set, MicroCompact runs on tool results and AutoCompact runs near the ceiling. */
  compressor?: ContextCompressor;
  /** Optional hook called once per turn after the model response is appended. */
  onTurn?: (turn: number, response: { content: ContentBlock[] }) => void | Promise<void>;
};

/**
 * The heart: an async generator that runs the model in a loop, executing
 * any tool calls it produces and feeding the results back as the next
 * user-role turn. Yields events the CLI/UI can stream.
 */
export async function* queryLoop(
  userInput: string,
  config: AgentLoopConfig,
): AsyncGenerator<AgentEvent> {
  const toolMap = buildToolMap(config.tools);
  const history: Message[] = [{ role: "user", content: userInput }];
  const maxTurns = config.maxTurns ?? 50;
  const compressor = config.compressor;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let turn = 0;
  let finalText = "";

  while (turn < maxTurns) {
    turn++;
    yield { type: "turn_start", turn };

    if (config.abortSignal?.aborted) {
      yield { type: "error", message: "Aborted by user" };
      return;
    }

    // Compaction check before sending to the model.
    if (compressor) {
      const tokens = estimateTokens(history);
      if (compressor.shouldAutoCompact(tokens)) {
        const compacted = await compressor.autoCompact(history);
        if (compacted) {
          const after = estimateTokens(compacted);
          history.length = 0;
          history.push(...compacted);
          yield { type: "compact", before: tokens, after };
        } else {
          yield { type: "compact_skipped", reason: "compaction returned null" };
        }
      }
    }

    let response;
    try {
      response = await config.engine.call({
        systemPrompt: config.systemPrompt,
        messages: history,
        tools: config.tools,
        maxTokens: config.maxTokens,
        abortSignal: config.abortSignal,
      });
    } catch (e) {
      yield { type: "error", message: `Model call failed: ${(e as Error).message}` };
      return;
    }

    totalInputTokens += response.usage.inputTokens;
    totalOutputTokens += response.usage.outputTokens;

    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        yield { type: "text", text: block.text };
        finalText += block.text;
      } else if (block.type === "tool_use") {
        yield { type: "tool_call", id: block.id, name: block.name, input: block.input };
      }
    }

    history.push({ role: "assistant", content: response.content });
    if (config.onTurn) await config.onTurn(turn, response);

    if (response.stopReason !== "tool_use") {
      yield {
        type: "complete",
        text: finalText,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
      return;
    }

    const toolUses = response.content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use",
    );
    const resultBlocks: ToolResultBlock[] = [];

    for (const tu of toolUses) {
      finalText = "";
      const tool = toolMap.get(tu.name);
      if (!tool) {
        resultBlocks.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Unknown tool: ${tu.name}`,
          is_error: true,
        });
        yield {
          type: "tool_result",
          id: tu.id,
          name: tu.name,
          result: `Unknown tool: ${tu.name}`,
          isError: true,
        };
        continue;
      }

      const ctx: ExecutionContext = {
        workingDirectory: config.workingDirectory,
        permissionLevel: config.permissionLevel,
        requestApproval: config.requestApproval,
        abortSignal: config.abortSignal,
      };

      const gateResult = PermissionGate.check(tool, ctx);
      if (gateResult.allowed === false) {
        resultBlocks.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Permission denied: ${gateResult.reason}`,
          is_error: true,
        });
        yield { type: "permission_denied", tool: tu.name, reason: gateResult.reason };
        continue;
      }

      if (gateResult.allowed === "needs_approval") {
        yield { type: "permission_request", tool: tu.name, input: tu.input };
        const approved = config.requestApproval
          ? await config.requestApproval(tu.name, tu.input)
          : false;
        if (!approved) {
          resultBlocks.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `User declined approval for ${tu.name}`,
            is_error: true,
          });
          yield { type: "permission_denied", tool: tu.name, reason: "user declined" };
          continue;
        }
      }

      let result: ToolResult;
      try {
        result = await tool.execute(tu.input, ctx);
      } catch (e) {
        result = { content: `Tool threw: ${(e as Error).message}`, isError: true };
      }

      // MicroCompact large outputs locally before they enter history.
      const trimmed = compressor ? compressor.micro(result.content) : result.content;

      resultBlocks.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: trimmed,
        is_error: result.isError,
      });
      yield {
        type: "tool_result",
        id: tu.id,
        name: tu.name,
        result: trimmed,
        isError: result.isError,
      };
    }

    history.push({
      role: "user",
      content: resultBlocks as ContentBlock[],
    });
  }

  yield { type: "error", message: `Exceeded max turns (${maxTurns})` };
}
