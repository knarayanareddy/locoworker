/**
 * Core message and content types — Anthropic-shaped.
 * The provider router translates to/from OpenAI shape at the boundary.
 */

export type Role = "user" | "assistant" | "system";

export type TextBlock = { type: "text"; text: string };

export type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export type Message = {
  role: Role;
  content: string | ContentBlock[];
};

export type StopReason =
  | "end_turn"
  | "tool_use"
  | "max_tokens"
  | "stop_sequence"
  | "error";

export type Usage = {
  inputTokens: number;
  outputTokens: number;
};

export type ModelResponse = {
  stopReason: StopReason;
  content: ContentBlock[];
  usage: Usage;
  model: string;
};

export type AgentEvent =
  | { type: "turn_start"; turn: number }
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; result: string; isError: boolean }
  | { type: "permission_denied"; tool: string; reason: string }
  | { type: "permission_request"; tool: string; input: Record<string, unknown> }
  | { type: "compact"; before: number; after: number }
  | { type: "compact_skipped"; reason: string }
  | { type: "complete"; text: string; usage: Usage }
  | { type: "error"; message: string };
