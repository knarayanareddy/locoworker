import Anthropic from "@anthropic-ai/sdk";
import type { StreamChunk, StreamingProvider } from "./types";

export class AnthropicStreamProvider implements StreamingProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async *streamCall(opts: {
    systemPrompt: string;
    messages: Array<{ role: string; content: unknown }>;
    tools: unknown[];
    maxTokens: number;
    model: string;
  }): AsyncGenerator<StreamChunk> {
    const stream = await this.client.messages.stream({
      model: opts.model ?? this.model,
      max_tokens: opts.maxTokens,
      system: opts.systemPrompt,
      messages: opts.messages as any,
      tools: opts.tools as any,
    });

    let currentToolId: string | undefined;
    let currentToolName: string | undefined;

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start":
          if (event.content_block.type === "tool_use") {
            currentToolId = event.content_block.id;
            currentToolName = event.content_block.name;
            yield {
              type: "tool_use_start",
              toolId: currentToolId,
              toolName: currentToolName,
            };
          }
          break;

        case "content_block_delta":
          if (event.delta.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            yield {
              type: "tool_use_delta",
              toolId: currentToolId,
              toolInputDelta: event.delta.partial_json,
            };
          }
          break;

        case "content_block_stop":
          if (currentToolId) {
            yield {
              type: "tool_use_end",
              toolId: currentToolId,
              toolName: currentToolName,
            };
            currentToolId = undefined;
            currentToolName = undefined;
          }
          break;

        case "message_stop":
          yield { type: "stop", stopReason: "end_turn" };
          break;

        case "message_delta":
          if (event.usage) {
            yield {
              type: "stop",
              stopReason: (event.delta as any).stop_reason ?? "end_turn",
              usage: {
                inputTokens: 0,
                outputTokens: event.usage.output_tokens,
              },
            };
          }
          break;
      }
    }
  }
}
