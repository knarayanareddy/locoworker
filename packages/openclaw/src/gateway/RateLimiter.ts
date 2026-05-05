export class RateLimiter {
  private windows = new Map<string, number[]>();

  constructor(private maxPerMinute: number) {}

  isAllowed(senderId: string): boolean {
    const now = Date.now();
    const windowStart = now - 60_000;

    const timestamps = (this.windows.get(senderId) ?? []).filter(
      (t) => t > windowStart
    );

    if (timestamps.length >= this.maxPerMinute) {
      this.windows.set(senderId, timestamps);
      return false;
    }

    timestamps.push(now);
    this.windows.set(senderId, timestamps);
    return true;
  }

  getRemainingCapacity(senderId: string): number {
    const now = Date.now();
    const windowStart = now - 60_000;
    const count = (this.windows.get(senderId) ?? []).filter(
      (t) => t > windowStart
    ).length;
    return Math.max(0, this.maxPerMinute - count);
  }
}
