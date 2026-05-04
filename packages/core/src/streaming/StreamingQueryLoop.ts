/**
 * Streaming variant of queryLoop.
 * Yields StreamingAgentEvents including live text deltas.
 * Drop-in replacement for queryLoop when the provider supports streaming.
 */

import type { StreamingProvider, StreamChunk } from "./types";
import type { ToolDefinition, ToolContext, AgentEvent } from "../index";
import { PermissionGate } from "../permissions/PermissionGate";

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
  permissionLevel?: string;
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
  const history: Array<{ role: string; content: unknown }> = [
    { role: "user", content: prompt },
  ];

  const gate = new PermissionGate(config.permissionLevel ?? "STANDARD");

  for (let turn = 0; turn < maxTurns; turn++) {
    yield { type: "turn_start" } as AgentEvent;
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
            toolName: chunk.toolName ?? "",
            toolId: chunk.toolId ?? "",
            toolInput: {},
          } as AgentEvent;
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
            error: chunk.error ?? "Unknown stream error",
          } as AgentEvent;
          return;
      }
    }

    yield { type: "stream_end" };

    // ── Build assistant message for history ───────────────────────────────
    const assistantContent: unknown[] = [];
    if (fullText) assistantContent.push({ type: "text", text: fullText });
    for (const tb of toolUseBlocks) {
      let input: unknown = {};
      try { input = JSON.parse(tb.inputJson || "{}"); } catch { /* keep {} */ }
      assistantContent.push({ type: "tool_use", id: tb.id, name: tb.name, input });
    }
    history.push({ role: "assistant", content: assistantContent });

    // ── If no tool calls, we're done ──────────────────────────────────────
    if (toolUseBlocks.length === 0 || stopReason !== "tool_use") {
      yield { type: "complete", usage } as AgentEvent;
      return;
    }

    // ── Execute tool calls ─────────────────────────────────────────────────
    const toolResultContent: unknown[] = [];

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

      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tb.inputJson || "{}"); } catch { /* empty */ }

      // Permission check
      const perm = gate.check(tool);
      if (!perm.allowed) {
        yield {
          type: "tool_denied",
          toolName: tb.name,
          reason: perm.reason,
        } as AgentEvent;
        toolResultContent.push({
          type: "tool_result",
          tool_use_id: tb.id,
          content: `Permission denied: ${perm.reason}`,
          is_error: true,
        });
        continue;
      }

      // Approval
      if (perm.requiresApproval && config.approvalHandler) {
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

      const ctx: ToolContext = {
        workingDirectory,
        settings: {} as any,
        tools,
      };

      try {
        const result = await tool.execute(input, ctx);
        yield { type: "tool_result", toolName: tb.name, content: result.content } as AgentEvent;
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

  yield { type: "complete", usage: { inputTokens: 0, outputTokens: 0 } } as AgentEvent;
}
