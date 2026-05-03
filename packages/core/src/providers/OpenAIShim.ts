import OpenAI from "openai";
import type { CallOptions, Provider, ProviderConfig, ProviderName } from "./ProviderInterface.js";
import type { ContentBlock, ModelResponse, Message, StopReason } from "../types.js";

/**
 * OpenAI-compatible shim. Translates the Anthropic-shaped internal types
 * to/from the OpenAI Chat Completions schema. Works against:
 *   - api.openai.com
 *   - localhost:11434/v1   (Ollama)
 *   - localhost:1234/v1    (LM Studio)
 *   - api.deepseek.com/v1
 *   - openrouter.ai/api/v1
 */
export class OpenAIShim implements Provider {
  readonly name: ProviderName;
  readonly model: string;
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.apiKey ?? "not-needed",
      baseURL: config.baseUrl ?? "https://api.openai.com/v1",
    });
  }

  async call(options: CallOptions): Promise<ModelResponse> {
    const messages = toOpenAIMessages(options.systemPrompt, options.messages);
    const tools = options.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as Record<string, unknown>,
      },
    }));

    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        max_tokens: options.maxTokens ?? 4096,
      },
      { signal: options.abortSignal },
    );

    const choice = response.choices[0];
    if (!choice) {
      return {
        stopReason: "error",
        content: [{ type: "text", text: "[empty response from provider]" }],
        usage: { inputTokens: 0, outputTokens: 0 },
        model: this.model,
      };
    }

    const blocks: ContentBlock[] = [];
    if (choice.message.content) {
      blocks.push({ type: "text", text: choice.message.content });
    }
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type !== "function") continue;
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(tc.function.arguments || "{}");
        } catch {
          parsed = { _rawArguments: tc.function.arguments };
        }
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: parsed,
        });
      }
    }

    return {
      stopReason: mapFinish(choice.finish_reason),
      content: blocks,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
    };
  }
}

function toOpenAIMessages(
  systemPrompt: string,
  messages: Message[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      if (msg.role === "user") out.push({ role: "user", content: msg.content });
      else if (msg.role === "assistant") out.push({ role: "assistant", content: msg.content });
      else out.push({ role: "system", content: msg.content });
      continue;
    }

    if (msg.role === "user") {
      // Tool results from prior turns live under user-role in our shape.
      // OpenAI requires them as separate role:tool messages.
      const textParts: string[] = [];
      for (const b of msg.content) {
        if (b.type === "text") textParts.push(b.text);
        else if (b.type === "tool_result") {
          if (textParts.length > 0) {
            out.push({ role: "user", content: textParts.join("\n") });
            textParts.length = 0;
          }
          out.push({
            role: "tool",
            tool_call_id: b.tool_use_id,
            content: b.content,
          });
        }
      }
      if (textParts.length > 0) {
        out.push({ role: "user", content: textParts.join("\n") });
      }
    } else if (msg.role === "assistant") {
      const textParts: string[] = [];
      const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];
      for (const b of msg.content) {
        if (b.type === "text") textParts.push(b.text);
        else if (b.type === "tool_use") {
          toolCalls.push({
            id: b.id,
            type: "function",
            function: { name: b.name, arguments: JSON.stringify(b.input) },
          });
        }
      }
      const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: textParts.join("\n") || null,
      };
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      out.push(assistantMsg);
    }
  }

  return out;
}

function mapFinish(r: string | null | undefined): StopReason {
  switch (r) {
    case "stop": return "end_turn";
    case "tool_calls": return "tool_use";
    case "function_call": return "tool_use";
    case "length": return "max_tokens";
    case "content_filter": return "error";
    default: return "end_turn";
  }
}
