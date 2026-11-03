/**
 * Bounded NDJSON tail readers (R-11).
 *
 * The old `AuditLog.read()` read every `.ndjson` file in full, parsed every
 * line into an object, and only then applied `slice(-limit)`. A large audit
 * history therefore allocated the whole file (and every event object) on each
 * dashboard request. These helpers read at most `maxScanBytes` from the *end*
 * of each file, never materialise more than the byte budget, and refuse
 * symlinks/non-regular files on the way in.
 */
import { constants } from "node:fs";
import { open } from "node:fs/promises";

const READ_CHUNK_BYTES = 64 * 1024;

export interface TailResult {
  /** Complete lines, in file order (oldest first within this tail). */
  lines: string[];
  bytesRead: number;
  /** True when the file is larger than the budget, so older lines were skipped. */
  truncated: boolean;
}

/**
 * Read complete lines from the last `maxBytes` of a file.
 * The first (possibly partial) line is dropped when the read starts mid-file.
 * Lines longer than `maxLineBytes` are dropped rather than parsed.
 */
export async function readFileTail(
  path: string,
  maxBytes: number,
  maxLineBytes = 256 * 1024,
): Promise<TailResult> {
  const budget = Math.max(1, Math.trunc(maxBytes) || 1);
  const lineCap = Math.max(1, Math.trunc(maxLineBytes) || 1);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    // O_NOFOLLOW: state dirs are operator-owned but may contain a symlink
    // planted by another process. Refuse it rather than following it.
    const flags = constants.O_RDONLY | ((constants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0);
    handle = await open(path, flags);
    const stat = await handle.stat();
    if (!stat.isFile()) return { lines: [], bytesRead: 0, truncated: false };

    const size = Math.min(stat.size, budget);
    const start = stat.size - size;
    const buf = Buffer.allocUnsafe(size);
    let read = 0;
    while (read < size) {
      const { bytesRead } = await handle.read(
        buf,
        read,
        Math.min(READ_CHUNK_BYTES, size - read),
        start + read,
      );
      if (bytesRead <= 0) break;
      read += bytesRead;
    }

    const text = buf.subarray(0, read).toString("utf8");
    let lines = text.split("\n");
    if (start > 0) lines.shift(); // partial first line / split UTF-8 sequence
    lines = lines.filter((line) => line.length > 0 && line.length <= lineCap);
    return { lines, bytesRead: read, truncated: start > 0 };
  } catch {
    // Missing/unreadable file: same behaviour as the old reader (skip it).
    return { lines: [], bytesRead: 0, truncated: false };
  } finally {
    await handle?.close().catch(() => {});
  }
}

/**
 * Bounded replacement for the dashboard's `readNdjson()` helper: read at most
 * `maxScanBytes` from the end of one file and return at most `limit` rows in
 * file order. Rejects over-long lines and non-object rows.
 */
export async function readNdjsonFileTail(
  path: string,
  limit: number,
  options: { maxScanBytes?: number; maxLineBytes?: number } = {},
): Promise<unknown[]> {
  const maxScanBytes = options.maxScanBytes ?? 8 * 1024 * 1024;
  const maxLineBytes = options.maxLineBytes ?? 256 * 1024;
  const wanted = Math.max(1, Math.trunc(limit) || 1);
  const tail = await readFileTail(path, maxScanBytes, maxLineBytes);
  const rows: unknown[] = [];
  for (let i = tail.lines.length - 1; i >= 0 && rows.length < wanted; i -= 1) {
    try {
      const value: unknown = JSON.parse(tail.lines[i]!);
      if (value && typeof value === "object") rows.push(value);
    } catch {
      // skip a malformed line rather than losing the whole tail
    }
  }
  return rows.reverse();
}

export interface ScanTailOptions<T> {
  /** Stop after this many accepted rows; 0 means "no row limit" (still byte-capped). */
  limit: number;
  /** Global byte budget across all files. */
  maxScanBytes: number;
  /** Max length of one NDJSON line. */
  maxLineBytes: number;
  /** Return null to reject a malformed / hostile line. */
  parse: (line: string) => T | null;
  /** Called newest-first. Keep it O(1) memory unless you collect into an array. */
  visit: (row: T) => void;
}

export interface ScanTailResult {
  count: number;
  bytesRead: number;
  truncated: boolean;
}

/**
 * Scan `paths` (ordered newest file first) from the tail backwards, stopping
 * at the row limit or the global byte budget. Never reads more than the budget.
 */
export async function scanNdjsonTail<T>(
  paths: readonly string[],
  options: ScanTailOptions<T>,
): Promise<ScanTailResult> {
  let remaining = Math.max(1, Math.trunc(options.maxScanBytes) || 1);
  const wanted = options.limit > 0 ? options.limit : Number.POSITIVE_INFINITY;
  let count = 0;
  let truncated = false;

  for (const path of paths) {
    if (remaining <= 0 || count >= wanted) break;
    const tail = await readFileTail(path, remaining, options.maxLineBytes);
    remaining -= tail.bytesRead;
    if (tail.truncated) truncated = true;
    for (let i = tail.lines.length - 1; i >= 0; i -= 1) {
      const row = options.parse(tail.lines[i]!);
      if (row === null) continue;
      options.visit(row);
      count += 1;
      if (count >= wanted) break;
    }
  }

  return {
    count,
    bytesRead: Math.max(0, Math.trunc(options.maxScanBytes) - remaining),
    truncated,
  };
}
