import type { Message, ContentBlock, ModelResponse } from "../../types.js";

export interface StreamChunk {
  type: "text_delta" | "tool_use_start" | "tool_use_delta" | "tool_use_end" | "message_stop" | "usage";
  text?: string;
  toolName?: string;
  toolId?: string;
  toolInputDelta?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface StreamingProvider {
  stream(opts: {
    systemPrompt: string;
    messages: Message[];
    tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
    maxTokens?: number;
  }): AsyncIterable<StreamChunk>;
}

/**
 * Assembles a ModelResponse from a stream of StreamChunks.
 * Used by providers that implement streaming to produce the same
 * ModelResponse type that non-streaming providers return.
 */
export async function assembleFromStream(
  stream: AsyncIterable<StreamChunk>
): Promise<ModelResponse> {
  const content: ContentBlock[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let currentText = "";
  let currentToolName = "";
  let currentToolId = "";
  let currentToolInputStr = "";
  let stopReason: ModelResponse["stopReason"] = "end_turn";

  for await (const chunk of stream) {
    switch (chunk.type) {
      case "text_delta":
        currentText += chunk.text ?? "";
        break;
      case "tool_use_start":
        // Flush any pending text
        if (currentText) {
          content.push({ type: "text", text: currentText });
          currentText = "";
        }
        currentToolName = chunk.toolName ?? "";
        currentToolId = chunk.toolId ?? "";
        currentToolInputStr = "";
        stopReason = "tool_use";
        break;
      case "tool_use_delta":
        currentToolInputStr += chunk.toolInputDelta ?? "";
        break;
      case "tool_use_end":
        try {
          content.push({
            type: "tool_use",
            id: currentToolId,
            name: currentToolName,
            input: JSON.parse(currentToolInputStr || "{}"),
          });
        } catch {
          content.push({
            type: "tool_use",
            id: currentToolId,
            name: currentToolName,
            input: {},
          });
        }
        break;
      case "usage":
        inputTokens += chunk.inputTokens ?? 0;
        outputTokens += chunk.outputTokens ?? 0;
        break;
      case "message_stop":
        if (currentText) {
          content.push({ type: "text", text: currentText });
          currentText = "";
        }
        break;
    }
  }

  if (currentText) {
    content.push({ type: "text", text: currentText });
  }

  return {
    stopReason,
    content,
    usage: { inputTokens, outputTokens },
    model: "",
  };
}
