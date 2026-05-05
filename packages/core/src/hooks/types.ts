// packages/core/src/hooks/types.ts

import type { AgentEvent } from "../types.js";

export type HookName =
  | "pre-tool"
  | "post-tool"
  | "on-turn"
  | "on-complete"
  | "on-event"
  | "on-error";

export interface HookContext {
  sessionId: string;
  workingDirectory: string;
  turnIndex: number;
  finalText: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export type PreToolHookFn = (
  toolName: string,
  input: unknown,
  ctx: HookContext
) => Promise<void> | void;

export type PostToolHookFn = (
  toolName: string,
  input: unknown,
  result: { content: string; isError: boolean },
  ctx: HookContext
) => Promise<void> | void;

export type OnCompleteHookFn = (ctx: HookContext) => Promise<void> | void;
export type OnTurnHookFn = (ctx: HookContext) => Promise<void> | void;
export type OnEventHookFn = (event: AgentEvent, ctx: HookContext) => Promise<void> | void;
export type OnErrorHookFn = (error: Error, ctx: HookContext) => Promise<void> | void;

export type HookFn =
  | PreToolHookFn
  | PostToolHookFn
  | OnCompleteHookFn
  | OnTurnHookFn
  | OnEventHookFn
  | OnErrorHookFn;
