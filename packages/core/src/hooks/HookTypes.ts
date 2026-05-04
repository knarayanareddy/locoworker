// packages/core/src/hooks/HookTypes.ts
// Defines all lifecycle hook event shapes.

import type { ToolDefinition, ExecutionContext } from "../Tool.js";
import type { AgentEvent } from "../types.js";

/** Called before a tool executes. Return false to cancel. */
export interface PreToolHookContext {
  toolName: string;
  input: unknown;
  executionContext: ExecutionContext;
}

/** Called after a tool executes (success or error). */
export interface PostToolHookContext {
  toolName: string;
  input: unknown;
  output: { content: string; isError: boolean };
  durationMs: number;
}

/** Called at the start of each agent turn (before model call). */
export interface OnTurnHookContext {
  turn: number;
  historyLength: number;
  estimatedTokens: number;
}

/** Called when the agent loop completes. */
export interface OnCompleteHookContext {
  turns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  finalText: string;
}

/** Called when any AgentEvent is emitted. */
export interface OnEventHookContext {
  event: AgentEvent;
}

export type HookFn<T> = (ctx: T) => void | boolean | Promise<void | boolean>;

export interface HookMap {
  "pre-tool": HookFn<PreToolHookContext>;
  "post-tool": HookFn<PostToolHookContext>;
  "on-turn": HookFn<OnTurnHookContext>;
  "on-complete": HookFn<OnCompleteHookContext>;
  "on-event": HookFn<OnEventHookContext>;
}

export type HookName = keyof HookMap;
