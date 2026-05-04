import OpenAI from "openai";
import type { StreamChunk, StreamingProvider } from "./types";

export class OpenAIStreamProvider implements StreamingProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, baseUrl: string, model: string) {
    this.client = new OpenAI({
      apiKey: apiKey || "not-needed",
      baseURL: baseUrl,
    });
    this.model = model;
  }

  async *streamCall(opts: {
    systemPrompt: string;
    messages: Array<{ role: string; content: unknown }>;
    tools: unknown[];
    maxTokens: number;
    model: string;
  }): AsyncGenerator<StreamChunk> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: opts.systemPrompt },
      ...(opts.messages as OpenAI.ChatCompletionMessageParam[]),
    ];

    const tools = (opts.tools as any[]).map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const stream = await this.client.chat.completions.create({
      model: opts.model ?? this.model,
      max_tokens: opts.maxTokens,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
    });

    // Accumulate tool call deltas
    const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Text delta
      if (delta.content) {
        yield { type: "text_delta", text: delta.content };
      }

      // Tool call deltas
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallBuffers.has(idx)) {
            toolCallBuffers.set(idx, { id: tc.id ?? "", name: tc.function?.name ?? "", args: "" });
            yield {
              type: "tool_use_start",
              toolId: tc.id ?? `tc-${idx}`,
              toolName: tc.function?.name ?? "",
            };
          }
          const buf = toolCallBuffers.get(idx)!;
          if (tc.function?.arguments) {
            buf.args += tc.function.arguments;
            yield {
              type: "tool_use_delta",
              toolId: buf.id || `tc-${idx}`,
              toolInputDelta: tc.function.arguments,
            };
          }
        }
      }

      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason) {
        // Emit tool_use_end for all accumulated tool calls
        for (const [idx, buf] of toolCallBuffers.entries()) {
          yield {
            type: "tool_use_end",
            toolId: buf.id || `tc-${idx}`,
            toolName: buf.name,
          };
        }
        yield {
          type: "stop",
          stopReason: finishReason,
          usage: chunk.usage
            ? {
                inputTokens: chunk.usage.prompt_tokens,
                outputTokens: chunk.usage.completion_tokens,
              }
            : undefined,
        };
      }
    }
  }
}
