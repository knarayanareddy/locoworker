// packages/core/src/hooks/HookRegistry.ts

import type {
  HookName,
  HookFn,
  PreToolHookFn,
  PostToolHookFn,
  OnCompleteHookFn,
  OnTurnHookFn,
  OnEventHookFn,
  OnErrorHookFn,
  HookContext,
} from "./types.js";
import type { AgentEvent } from "../types.js";

export class HookRegistry {
  private hooks = new Map<HookName, HookFn[]>();

  register(name: HookName, fn: HookFn): void {
    const existing = this.hooks.get(name) ?? [];
    this.hooks.set(name, [...existing, fn]);
  }

  async runPreTool(toolName: string, input: unknown, ctx: HookContext): Promise<void> {
    const fns = (this.hooks.get("pre-tool") ?? []) as PreToolHookFn[];
    for (const fn of fns) await fn(toolName, input, ctx);
  }

  async runPostTool(
    toolName: string,
    input: unknown,
    result: { content: string; isError: boolean },
    ctx: HookContext
  ): Promise<void> {
    const fns = (this.hooks.get("post-tool") ?? []) as PostToolHookFn[];
    for (const fn of fns) await fn(toolName, input, result, ctx);
  }

  async runOnComplete(ctx: HookContext): Promise<void> {
    const fns = (this.hooks.get("on-complete") ?? []) as OnCompleteHookFn[];
    for (const fn of fns) await fn(ctx);
  }

  async runOnTurn(ctx: HookContext): Promise<void> {
    const fns = (this.hooks.get("on-turn") ?? []) as OnTurnHookFn[];
    for (const fn of fns) await fn(ctx);
  }

  async runOnEvent(event: AgentEvent, ctx: HookContext): Promise<void> {
    const fns = (this.hooks.get("on-event") ?? []) as OnEventHookFn[];
    for (const fn of fns) await fn(event, ctx);
  }

  async runOnError(error: Error, ctx: HookContext): Promise<void> {
    const fns = (this.hooks.get("on-error") ?? []) as OnErrorHookFn[];
    for (const fn of fns) await fn(error, ctx);
  }

  clear(name?: HookName): void {
    if (name) {
      this.hooks.delete(name);
    } else {
      this.hooks.clear();
    }
  }
}
