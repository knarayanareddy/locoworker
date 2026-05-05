import Anthropic from "@anthropic-ai/sdk";
import type { StreamChunk, StreamingProvider } from "../services/streaming/StreamingProvider.js";
import type { Message } from "../types.js";
import type { ToolDefinition } from "../Tool.js";

export class AnthropicStreamingProvider implements StreamingProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async *stream(opts: {
    systemPrompt: string;
    messages: Message[];
    tools: ToolDefinition[];
    maxTokens?: number;
  }): AsyncIterable<StreamChunk> {
    const anthropicMessages = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          typeof m.content === "string"
            ? m.content
            : m.content.map((b: any) => {
                if (b.type === "text") return { type: "text" as const, text: b.text };
                if (b.type === "tool_use") {
                  return {
                    type: "tool_use" as const,
                    id: b.id,
                    name: b.name,
                    input: b.input,
                  };
                }
                if (b.type === "tool_result") {
                  return {
                    type: "tool_result" as const,
                    tool_use_id: b.tool_use_id ?? "",
                    content: b.content,
                  };
                }
                return { type: "text" as const, text: "" };
              }),
      }));

    const anthropicTools =
      opts.tools.length > 0
        ? opts.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
          }))
        : undefined;

    const stream = await this.client.messages.stream({
      model: this.model,
      system: opts.systemPrompt,
      messages: anthropicMessages,
      tools: anthropicTools,
      max_tokens: opts.maxTokens ?? 4096,
    });

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_delta":
          if (event.delta.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            yield { type: "tool_use_delta", toolInputDelta: event.delta.partial_json };
          }
          break;

        case "content_block_start":
          if (event.content_block.type === "tool_use") {
            yield {
              type: "tool_use_start",
              toolName: event.content_block.name,
              toolId: event.content_block.id,
            };
          }
          break;

        case "content_block_stop":
          if (event.index !== undefined) {
            yield { type: "tool_use_end" };
          }
          break;

        case "message_delta":
          if (event.usage) {
            yield { type: "usage", outputTokens: event.usage.output_tokens };
          }
          break;

        case "message_start":
          if (event.message.usage) {
            yield { type: "usage", inputTokens: event.message.usage.input_tokens };
          }
          break;

        case "message_stop":
          yield { type: "message_stop" };
          break;
      }
    }
  }
}
