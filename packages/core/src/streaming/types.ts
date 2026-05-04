export interface StreamChunk {
  type: "text_delta" | "tool_use_start" | "tool_use_delta" | "tool_use_end" | "stop" | "error";
  text?: string;
  toolName?: string;
  toolId?: string;
  toolInputDelta?: string;
  stopReason?: string;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface StreamingProvider {
  streamCall(opts: {
    systemPrompt: string;
    messages: Array<{ role: string; content: unknown }>;
    tools: unknown[];
    maxTokens: number;
    model: string;
  }): AsyncGenerator<StreamChunk>;
}
