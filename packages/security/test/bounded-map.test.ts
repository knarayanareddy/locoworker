import { describe, expect, test } from "bun:test";
import { BoundedMap } from "../src/utils/BoundedMap.js";
import { mergeResourceLimits, resolveResourceLimits } from "../src/utils/resourceLimits.js";

describe("R-11: BoundedMap enforces hard entry/byte/TTL ceilings", () => {
  test("entry cap evicts the least-recently-used key", () => {
    const map = new BoundedMap<string, string>({ maxEntries: 3 });
    for (const key of ["a", "b", "c", "d"]) map.set(key, key);
    expect(map.size).toBe(3);
    expect(map.get("a")).toBeUndefined();
    expect(map.entries().map(([k]) => k)).toEqual(["b", "c", "d"]);
    expect(map.stats().evictions.entries).toBe(1);
  });

  test("a read refreshes LRU order but does not extend TTL", () => {
    let now = 1_000;
    const map = new BoundedMap<string, string>({
      maxEntries: 3,
      ttlMs: 10_000,
      now: () => now,
      pruneIntervalMs: 0,
    });
    map.set("a", "a");
    map.set("b", "b");
    map.set("c", "c");
    expect(map.get("a")).toBe("a"); // a is now most recently used
    map.set("d", "d");
    expect(map.get("b")).toBeUndefined(); // b was the LRU victim
    expect(map.get("a")).toBe("a");
    now += 10_001;
    expect(map.get("a")).toBeUndefined(); // absolute TTL from the last set
    expect(map.stats().evictions.ttl).toBeGreaterThanOrEqual(1);
  });

  test("byte cap evicts until the approximate total is under the ceiling", () => {
    const map = new BoundedMap<string, string>({
      maxEntries: 100,
      maxBytes: 10,
      estimateSize: (_key, value) => value.length,
    });
    map.set("a", "aaaa");
    map.set("b", "bbbb");
    map.set("c", "cccc"); // total 12 > 10
    expect(map.stats().bytes).toBeLessThanOrEqual(10);
    expect(map.get("a")).toBeUndefined();
    expect(map.stats().evictions.bytes).toBe(1);
  });

  test("a single oversized value is refused, not stored", () => {
    const map = new BoundedMap<string, string>({
      maxEntries: 10,
      maxBytes: 4,
      estimateSize: (_key, value) => value.length,
    });
    expect(map.set("huge", "x".repeat(10))).toBe(false);
    expect(map.size).toBe(0);
    expect(map.stats().evictions.oversize).toBe(1);
  });

  test("TTL expiry is pruned on write and reported in stats", () => {
    let now = 0;
    const map = new BoundedMap<string, number>({
      maxEntries: 10,
      ttlMs: 100,
      now: () => now,
      pruneIntervalMs: 0,
    });
    map.set("a", 1);
    now = 101;
    map.set("b", 2); // triggers a prune
    expect(map.keys()).toEqual(["b"]);
    expect(map.stats().evictions.ttl).toBe(1);
  });

  test("10 000 distinct senders never exceed the configured session cap", () => {
    const map = new BoundedMap<string, string>({
      maxEntries: 1_000,
      maxBytes: 1_000_000,
      estimateSize: (key) => key.length,
    });
    for (let i = 0; i < 10_000; i += 1) {
      map.set(`sender-${i}`, `history-${i}`);
    }
    expect(map.size).toBe(1_000);
    expect(map.stats().bytes).toBeLessThanOrEqual(1_000_000);
    expect(map.stats().evictions.entries).toBe(9_000);
    expect(map.get("sender-9999")).toBe("history-9999");
    expect(map.get("sender-0")).toBeUndefined();
  });
});

describe("R-11: resource limits come from trusted, clamped values", () => {
  test("defaults are finite and positive", () => {
    const limits = resolveResourceLimits({});
    for (const value of Object.values(limits)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
    expect(limits.maxSessions).toBe(1_000);
    expect(limits.maxSseConnections).toBe(32);
  });

  test("invalid and out-of-range env values cannot disable a bound", () => {
    const limits = resolveResourceLimits({
      COWORK_MAX_SESSIONS: "0",
      COWORK_MAX_REQUEST_BYTES: "not-a-number",
      COWORK_MAX_SSE_CONNECTIONS: "99999999",
    });
    expect(limits.maxSessions).toBe(1_000);
    expect(limits.maxRequestBytes).toBe(1024 * 1024);
    expect(limits.maxSseConnections).toBe(32); // out-of-range -> safe default
  });

  test("trusted overrides are clamped to the same safe range", () => {
    const limits = mergeResourceLimits({ maxSessions: -5, sessionTtlMs: 50 });
    expect(limits.maxSessions).toBe(1_000); // out-of-range -> safe default
    expect(limits.sessionTtlMs).toBe(30 * 60_000);
  });
});
