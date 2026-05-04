// packages/core/src/hooks/HookRegistry.ts
// Registry for lifecycle hooks. Multiple hooks per event are called in registration order.

import type { HookMap, HookName, HookFn } from "./HookTypes.js";

export class HookRegistry {
  private readonly hooks: { [K in HookName]?: Array<HookFn<unknown>> } = {};

  on<K extends HookName>(event: K, fn: HookFn<HookMap[K]>): () => void {
    if (!this.hooks[event]) this.hooks[event] = [];
    this.hooks[event]!.push(fn as HookFn<unknown>);
    return () => this.off(event, fn);
  }

  off<K extends HookName>(event: K, fn: HookFn<HookMap[K]>): void {
    const list = this.hooks[event];
    if (!list) return;
    const idx = list.indexOf(fn as HookFn<unknown>);
    if (idx !== -1) list.splice(idx, 1);
  }

  /** Run all hooks for an event. Returns false if any hook returned false (cancellation). */
  async run<K extends HookName>(event: K, ctx: Parameters<HookMap[K]>[0]): Promise<boolean> {
    const list = this.hooks[event];
    if (!list || list.length === 0) return true;
    for (const fn of list) {
      const result = await fn(ctx as unknown);
      if (result === false) return false;
    }
    return true;
  }

  clear(event?: HookName): void {
    if (event) {
      delete this.hooks[event];
    } else {
      for (const k of Object.keys(this.hooks) as HookName[]) {
        delete this.hooks[k];
      }
    }
  }
}
