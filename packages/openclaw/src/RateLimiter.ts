import type { RateLimitState } from "./types";

export class RateLimiter {
  private states = new Map<string, RateLimitState>();
  private limitPerMinute: number;

  constructor(limitPerMinute = 20) {
    this.limitPerMinute = limitPerMinute;
  }

  check(userId: string): boolean {
    const now = Date.now();
    const window = 60_000;

    let state = this.states.get(userId);
    if (!state || now - state.windowStart > window) {
      state = { userId, count: 0, windowStart: now };
      this.states.set(userId, state);
    }

    state.count++;
    return state.count <= this.limitPerMinute;
  }

  remaining(userId: string): number {
    const state = this.states.get(userId);
    if (!state) return this.limitPerMinute;
    if (Date.now() - state.windowStart > 60_000) return this.limitPerMinute;
    return Math.max(0, this.limitPerMinute - state.count);
  }

  // Prune stale entries periodically
  prune(): void {
    const cutoff = Date.now() - 120_000;
    for (const [id, state] of this.states.entries()) {
      if (state.windowStart < cutoff) this.states.delete(id);
    }
  }
}
