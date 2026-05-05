/**
 * Streaming variant of queryLoop.
 * Yields StreamingAgentEvents including live text deltas.
 * Drop-in replacement for queryLoop when the provider supports streaming.
 */

import type { StreamingProvider } from "./types";
import type { ToolDefinition, ToolContext, AgentEvent } from "../index";
import { PermissionGate } from "../permissions/PermissionGate.js";
import { PermissionLevel } from "../permissions/PermissionLevel.js";

export type StreamingAgentEvent =
  | AgentEvent
  | { type: "text_delta"; text: string }
  | { type: "stream_start" }
  | { type: "stream_end" };

export interface StreamingLoopConfig {
  provider: StreamingProvider;
  systemPrompt: string;
  tools: ToolDefinition[];
  maxTurns?: number;
  maxTokens?: number;
  permissionLevel?: PermissionLevel;
  workingDirectory: string;
  approvalHandler?: (toolName: string, input: unknown) => Promise<boolean>;
  onToolCall?: (toolName: string) => void;
}

export async function* streamingQueryLoop(
  prompt: string,
  config: StreamingLoopConfig
): AsyncGenerator<StreamingAgentEvent> {
  const { provider, systemPrompt, tools, maxTurns = 50, maxTokens = 4096, workingDirectory } = config;
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const history: Array<{ role: string; content: any }> = [
    { role: "user", content: prompt },
  ];

  const sessionLevel = config.permissionLevel ?? PermissionLevel.STANDARD;

  for (let turn = 0; turn < maxTurns; turn++) {
    yield { type: "turn_start", turn };
    yield { type: "stream_start" };

    // ── Accumulate streamed content into blocks ────────────────────────────
    let fullText = "";
    const toolUseBlocks: Array<{ id: string; name: string; inputJson: string }> = [];
    let currentToolIdx = -1;
    let stopReason = "end_turn";
    let usage = { inputTokens: 0, outputTokens: 0 };

    for await (const chunk of provider.streamCall({
      systemPrompt,
      messages: history,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      maxTokens,
      model: "", // resolved by provider instance
    })) {
      switch (chunk.type) {
        case "text_delta":
          fullText += chunk.text ?? "";
          yield { type: "text_delta", text: chunk.text ?? "" };
          break;

        case "tool_use_start":
          currentToolIdx = toolUseBlocks.push({
            id: chunk.toolId ?? "",
            name: chunk.toolName ?? "",
            inputJson: "",
          }) - 1;
          yield {
            type: "tool_call",
            id: chunk.toolId ?? "",
            name: chunk.toolName ?? "",
            input: {},
          };
          break;

        case "tool_use_delta":
          if (currentToolIdx >= 0) {
            toolUseBlocks[currentToolIdx].inputJson += chunk.toolInputDelta ?? "";
          }
          break;

        case "tool_use_end":
          currentToolIdx = -1;
          break;

        case "stop":
          stopReason = chunk.stopReason ?? "end_turn";
          if (chunk.usage) usage = chunk.usage;
          break;

        case "error":
          yield {
            type: "error",
            message: chunk.error ?? "Unknown stream error",
          };
          return;
      }
    }

    yield { type: "stream_end" };

    // ── Build assistant message for history ───────────────────────────────
    const assistantContent: any[] = [];
    if (fullText) assistantContent.push({ type: "text", text: fullText });
    for (const tb of toolUseBlocks) {
      let input: any = {};
      try { input = JSON.parse(tb.inputJson || "{}"); } catch { /* keep {} */ }
      assistantContent.push({ type: "tool_use", id: tb.id, name: tb.name, input });
    }
    history.push({ role: "assistant", content: assistantContent });

    // ── If no tool calls, we're done ──────────────────────────────────────
    if (toolUseBlocks.length === 0 || stopReason !== "tool_use") {
      yield { type: "complete", text: fullText, usage };
      return;
    }

    // ── Execute tool calls ─────────────────────────────────────────────────
    const toolResultContent: any[] = [];

    for (const tb of toolUseBlocks) {
      config.onToolCall?.(tb.name);

      const tool = toolMap.get(tb.name);
      if (!tool) {
        toolResultContent.push({
          type: "tool_result",
          tool_use_id: tb.id,
          content: `Tool not found: ${tb.name}`,
          is_error: true,
        });
        continue;
      }

      let input: Record<string, any> = {};
      try { input = JSON.parse(tb.inputJson || "{}"); } catch { /* empty */ }

      const ctx: ToolContext = {
        workingDirectory,
        settings: {} as any,
        tools,
        permissionLevel: sessionLevel,
      };

      // Permission check
      const perm = PermissionGate.check(tool, ctx);
      if (perm.allowed === false) {
        yield {
          type: "permission_denied",
          tool: tb.name,
          reason: perm.reason,
        };
        toolResultContent.push({
          type: "tool_result",
          tool_use_id: tb.id,
          content: `Permission denied: ${perm.reason}`,
          is_error: true,
        });
        continue;
      }

      // Approval
      if (perm.allowed === "needs_approval" && config.approvalHandler) {
        yield {
          type: "permission_request",
          tool: tb.name,
          input,
        };
        const approved = await config.approvalHandler(tb.name, input);
        if (!approved) {
          toolResultContent.push({
            type: "tool_result",
            tool_use_id: tb.id,
            content: "User denied approval",
            is_error: true,
          });
          continue;
        }
      }

      try {
        const result = await tool.execute(input, ctx);
        yield {
          type: "tool_result",
          id: tb.id,
          name: tb.name,
          result: result.content,
          isError: result.isError,
        };
        toolResultContent.push({
          type: "tool_result",
          tool_use_id: tb.id,
          content: result.content,
          is_error: result.isError,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toolResultContent.push({
          type: "tool_result",
          tool_use_id: tb.id,
          content: `Tool error: ${msg}`,
          is_error: true,
        });
      }
    }

    history.push({ role: "user", content: toolResultContent });
  }

  yield { type: "complete", text: "", usage: { inputTokens: 0, outputTokens: 0 } };
}
