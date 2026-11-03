/**
 * A Map with hard bounds on entry count, approximate value bytes and TTL.
 *
 * Used for gateway session/outbox state (R-11). The old plain `Map` grew
 * without limit: one key per remote sender, and one array of up to 50 replies
 * per outbox. A client able to mint sender identities could exhaust memory.
 *
 * Bounds are enforced on every write. LRU order is maintained on both `set`
 * and `get`; TTL is absolute from the last `set` (a read does not extend it).
 */

export type BoundedEvictionReason =
  | "entries"
  | "bytes"
  | "ttl"
  | "oversize"
  | "explicit";

export interface BoundedEvictionCounts {
  entries: number;
  bytes: number;
  ttl: number;
  oversize: number;
  explicit: number;
}

export interface BoundedMapOptions<K, V> {
  maxEntries: number;
  /** Approximate byte ceiling across all values. Default: unbounded. */
  maxBytes?: number;
  /** Absolute lifetime of an entry in ms. Default: no expiry. */
  ttlMs?: number;
  /** Approximate size of one value; defaults to 1 byte per entry. */
  estimateSize?: (key: K, value: V) => number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Called once per eviction (keep it cheap — see createEvictionLogger). */
  onEvict?: (key: K, value: V, reason: BoundedEvictionReason) => void;
  /** How often expired entries are pruned on write, in ms. Default 1000. */
  pruneIntervalMs?: number;
}

interface Entry<V> {
  value: V;
  bytes: number;
  expiresAt: number;
}

export interface BoundedMapStats {
  size: number;
  bytes: number;
  maxEntries: number;
  maxBytes: number;
  evictions: Readonly<BoundedEvictionCounts>;
}

export class BoundedMap<K, V> {
  private readonly data = new Map<K, Entry<V>>();
  private totalBytes = 0;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private readonly estimate: (key: K, value: V) => number;
  private readonly now: () => number;
  private readonly onEvict?: (key: K, value: V, reason: BoundedEvictionReason) => void;
  private readonly pruneIntervalMs: number;
  private lastPrune = Number.NEGATIVE_INFINITY;

  readonly evictions: BoundedEvictionCounts = {
    entries: 0,
    bytes: 0,
    ttl: 0,
    oversize: 0,
    explicit: 0,
  };

  constructor(options: BoundedMapOptions<K, V>) {
    this.maxEntries = Math.max(1, Math.trunc(options.maxEntries) || 1);
    this.maxBytes = options.maxBytes === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.trunc(options.maxBytes));
    this.ttlMs = options.ttlMs ?? Number.POSITIVE_INFINITY;
    this.estimate = options.estimateSize ?? (() => 1);
    this.now = options.now ?? Date.now;
    this.onEvict = options.onEvict;
    this.pruneIntervalMs = Math.max(0, options.pruneIntervalMs ?? 1_000);
  }

  /**
   * Insert or replace. Returns `false` when a *single* value already exceeds
   * `maxBytes` — such an entry is refused rather than stored, so the byte
   * ceiling is a real invariant, not a best-effort estimate.
   */
  set(key: K, value: V): boolean {
    this.maybePrune();
    const bytes = Math.max(1, Math.trunc(this.estimate(key, value)) || 1);
    if (bytes > this.maxBytes) {
      this.count("oversize");
      this.onEvict?.(key, value, "oversize");
      return false;
    }

    const existing = this.data.get(key);
    if (existing) {
      this.totalBytes -= existing.bytes;
      this.data.delete(key);
    }

    const entry: Entry<V> = {
      value,
      bytes,
      expiresAt: this.now() + this.ttlMs,
    };
    this.data.set(key, entry);
    this.totalBytes += bytes;
    this.enforce();
    return true;
  }

  get(key: K): V | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.remove(key, entry, "ttl");
      return undefined;
    }
    // LRU-on-read: move to the end without extending the TTL.
    this.data.delete(key);
    this.data.set(key, entry);
    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    const entry = this.data.get(key);
    if (!entry) return false;
    this.remove(key, entry, "explicit");
    return true;
  }

  clear(): void {
    for (const [key, entry] of this.data) {
      this.remove(key, entry, "explicit");
    }
    this.data.clear();
    this.totalBytes = 0;
  }

  /** Live entry count (expired entries are pruned first). */
  get size(): number {
    this.pruneExpired();
    return this.data.size;
  }

  keys(): K[] {
    this.pruneExpired();
    return [...this.data.keys()];
  }

  /** Live entries in least- to most-recently-used order. */
  entries(): Array<[K, V]> {
    this.pruneExpired();
    return [...this.data.entries()].map(([k, e]) => [k, e.value] as [K, V]);
  }

  /** Force a full expiry sweep (also available for deterministic tests). */
  pruneExpired(): void {
    if (this.ttlMs === Number.POSITIVE_INFINITY) return;
    const now = this.now();
    this.lastPrune = now;
    for (const [key, entry] of this.data) {
      if (entry.expiresAt <= now) this.remove(key, entry, "ttl");
    }
  }

  stats(): BoundedMapStats {
    return {
      size: this.size,
      bytes: this.totalBytes,
      maxEntries: this.maxEntries,
      maxBytes: this.maxBytes,
      evictions: { ...this.evictions },
    };
  }

  private maybePrune(): void {
    if (this.ttlMs === Number.POSITIVE_INFINITY) return;
    const now = this.now();
    if (now - this.lastPrune < this.pruneIntervalMs) return;
    this.pruneExpired();
  }

  private enforce(): void {
    while (this.data.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      const first = this.data.keys().next();
      if (first.done) break;
      const key = first.value as K;
      const entry = this.data.get(key);
      if (!entry) break;
      const reason: BoundedEvictionReason =
        this.data.size > this.maxEntries ? "entries" : "bytes";
      this.remove(key, entry, reason);
    }
  }

  private remove(key: K, entry: Entry<V>, reason: BoundedEvictionReason): void {
    this.data.delete(key);
    this.totalBytes = Math.max(0, this.totalBytes - entry.bytes);
    this.count(reason);
    this.onEvict?.(key, entry.value, reason);
  }

  private count(reason: BoundedEvictionReason): void {
    this.evictions[reason] += 1;
  }
}
