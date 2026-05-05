import OpenAI from "openai";
import type { StreamChunk, StreamingProvider } from "../services/streaming/StreamingProvider.js";
import type { Message } from "../types.js";
import type { ToolDefinition } from "../Tool.js";

export class OpenAIStreamingProvider implements StreamingProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, baseUrl: string, model: string) {
    this.client = new OpenAI({ apiKey: apiKey || "unused", baseURL: baseUrl });
    this.model = model;
  }

  async *stream(opts: {
    systemPrompt: string;
    messages: Message[];
    tools: ToolDefinition[];
    maxTokens?: number;
  }): AsyncIterable<StreamChunk> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: opts.systemPrompt },
      ...opts.messages
        .filter((m) => m.role !== "system")
        .map((m): OpenAI.ChatCompletionMessageParam => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
    ];

    const tools: OpenAI.ChatCompletionTool[] =
      opts.tools.length > 0
        ? opts.tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.inputSchema as Record<string, unknown>,
            },
          }))
        : [];

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: opts.maxTokens ?? 4096,
      stream: true,
    });

    const toolCallAccumulator = new Map<
      number,
      { id: string; name: string; args: string }
    >();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: "text_delta", text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallAccumulator.has(idx)) {
            toolCallAccumulator.set(idx, { id: "", name: "", args: "" });
            if (tc.id) {
              toolCallAccumulator.get(idx)!.id = tc.id;
            }
            if (tc.function?.name) {
              toolCallAccumulator.get(idx)!.name = tc.function.name;
              yield {
                type: "tool_use_start",
                toolName: tc.function.name,
                toolId: tc.id ?? "",
              };
            }
          }

          if (tc.function?.arguments) {
            toolCallAccumulator.get(idx)!.args += tc.function.arguments;
            yield { type: "tool_use_delta", toolInputDelta: tc.function.arguments };
          }
        }
      }

      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason === "tool_calls") {
        for (const [_idx, tc] of toolCallAccumulator) {
          if (tc.name) yield { type: "tool_use_end" };
        }
      }

      if (chunk.usage) {
        yield {
          type: "usage",
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
      }
    }

    yield { type: "message_stop" };
  }
}
