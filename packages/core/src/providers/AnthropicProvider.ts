import Anthropic from "@anthropic-ai/sdk";
import type {
  Tool as AnthropicToolDef,
  MessageParam,
  ContentBlock as AnthropicContentBlock,
  TextBlockParam,
  ToolUseBlockParam,
  ToolResultBlockParam,
  ImageBlockParam,
  Message as AnthropicMessage,
} from "@anthropic-ai/sdk/resources/messages";
import type { CallOptions, Provider, ProviderConfig } from "./ProviderInterface.js";
import type { ContentBlock, ModelResponse, Message, StopReason } from "../types.js";

type AnthropicBlockParam =
  | TextBlockParam
  | ImageBlockParam
  | ToolUseBlockParam
  | ToolResultBlockParam;

/**
 * Direct Anthropic Messages API — no translation needed since our
 * internal types are Anthropic-shaped.
 */
export class AnthropicProvider implements Provider {
  readonly name = "anthropic" as const;
  readonly model: string;
  private client: Anthropic;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required for Anthropic provider");
    }
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.model = config.model;
  }

  async call(options: CallOptions): Promise<ModelResponse> {
    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: options.maxTokens ?? 4096,
        system: options.systemPrompt,
        messages: options.messages.map(toAnthropicMessage),
        tools: options.tools.map<AnthropicToolDef>((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as AnthropicToolDef["input_schema"],
        })),
      },
      { signal: options.abortSignal },
    );

    return {
      stopReason: mapStopReason(response.stop_reason),
      content: response.content.map(fromAnthropicBlock),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  }
}

function toAnthropicMessage(msg: Message): MessageParam {
  if (msg.role === "system") {
    const text = typeof msg.content === "string" ? msg.content : stringify(msg.content);
    return { role: "user", content: `[system note] ${text}` };
  }

  if (typeof msg.content === "string") {
    return { role: msg.role, content: msg.content };
  }

  const blocks: AnthropicBlockParam[] = msg.content.map((b) => {
    if (b.type === "text") return { type: "text", text: b.text };
    if (b.type === "tool_use") {
      return { type: "tool_use", id: b.id, name: b.name, input: b.input };
    }
    return {
      type: "tool_result",
      tool_use_id: b.tool_use_id,
      content: b.content,
      is_error: b.is_error,
    };
  });
  return { role: msg.role, content: blocks };
}

function fromAnthropicBlock(b: AnthropicContentBlock): ContentBlock {
  if (b.type === "text") return { type: "text", text: b.text };
  if (b.type === "tool_use") {
    return {
      type: "tool_use",
      id: b.id,
      name: b.name,
      input: (b.input ?? {}) as Record<string, unknown>,
    };
  }
  return { type: "text", text: "" };
}

function mapStopReason(r: AnthropicMessage["stop_reason"]): StopReason {
  switch (r) {
    case "end_turn": return "end_turn";
    case "tool_use": return "tool_use";
    case "max_tokens": return "max_tokens";
    case "stop_sequence": return "stop_sequence";
    default: return "end_turn";
  }
}

function stringify(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => (b.type === "text" ? b.text : JSON.stringify(b)))
    .join("\n");
}
