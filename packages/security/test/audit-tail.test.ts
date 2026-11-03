import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog } from "../src/audit/AuditLog.js";
import { serializeAuditExport } from "../src/utils/auditExport.js";
import { readNdjsonFileTail } from "../src/utils/tailFile.js";

let home: string;
let previous: string | undefined;

const LIMITS = {
  maxAuditScanBytes: 128 * 1024,
  maxAuditFiles: 5,
  maxAuditRows: 200,
  maxAuditLineBytes: 4_096,
  maxAuditExportRows: 50,
  maxAuditExportBytes: 4_096,
};

function makeEvent(id: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id,
    kind: "tool_call",
    sessionId: "s1",
    projectRoot: "/tmp/project",
    timestamp: "2026-11-03T00:00:00.000Z",
    actor: "agent",
    toolName: "Read",
    inputSummary: "x".repeat(120),
    outcome: "success",
    ...overrides,
  });
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "cowork-audit-tail-"));
  previous = process.env.COWORK_HOME;
  process.env.COWORK_HOME = home;
});

afterEach(async () => {
  if (previous === undefined) delete process.env.COWORK_HOME;
  else process.env.COWORK_HOME = previous;
  await rm(home, { recursive: true, force: true });
});

describe("R-11: AuditLog reads a bounded tail, never the whole file", () => {
  test("a large audit log is read under a hard byte budget and returns the newest rows", async () => {
    const log = new AuditLog({ sessionId: "s1", projectRoot: "/tmp/project", limits: LIMITS });
    await log.init();

    // ~8 MiB of history — the old implementation parsed all of it on every call.
    const lines: string[] = [];
    const targetBytes = 8 * 1024 * 1024;
    let bytes = 0;
    let i = 0;
    while (bytes < targetBytes) {
      const line = makeEvent(`event-${i}`);
      lines.push(line);
      bytes += line.length + 1;
      i += 1;
    }
    lines.push(makeEvent("last-event"));
    await writeFile(log.path, lines.join("\n") + "\n", "utf-8");

    const events = await log.read(10);
    expect(events.length).toBe(10);
    expect(events[events.length - 1]!.id).toBe("last-event");
    expect(log.lastScan.bytesRead).toBeLessThanOrEqual(LIMITS.maxAuditScanBytes);
    expect(log.lastScan.truncated).toBe(true);
  });

  test("malformed, oversized, prototype-polluting and unknown-field lines are rejected", async () => {
    const log = new AuditLog({ sessionId: "s1", projectRoot: "/tmp/project", limits: LIMITS });
    await log.init();
    await writeFile(
      log.path,
      [
        makeEvent("good-1"),
        "not json at all",
        '{"__proto__":{"polluted":true},"id":"evil"}',
        makeEvent("bad-extra", { unexpected: "field" }),
        "x".repeat(10_000),
        makeEvent("good-2"),
      ].join("\n") + "\n",
      "utf-8",
    );

    const events = await log.read(100);
    expect(events.map((e) => e.id).sort()).toEqual(["good-1", "good-2"]);
  });

  test("countRecent counts without materialising events", async () => {
    const log = new AuditLog({ sessionId: "s1", projectRoot: "/tmp/project", limits: LIMITS });
    await log.init();
    await writeFile(
      log.path,
      [makeEvent("a"), makeEvent("b"), makeEvent("c")].join("\n") + "\n",
      "utf-8",
    );
    const count = await log.countRecent(1_000);
    expect(count).toBe(3);
    expect(log.lastScan.rows).toBe(3);
    expect((await log.readTail(1_000)).length).toBe(3);
  });

  test("read(0) is still hard-capped, not an unbounded 'give me everything'", async () => {
    const log = new AuditLog({ sessionId: "s1", projectRoot: "/tmp/project", limits: LIMITS });
    await log.init();
    const lines = Array.from({ length: 500 }, (_, i) => makeEvent(`row-${i}`));
    await writeFile(log.path, lines.join("\n") + "\n", "utf-8");
    const events = await log.read(0);
    expect(events.length).toBeLessThanOrEqual(LIMITS.maxAuditRows);
    expect(log.lastScan.bytesRead).toBeLessThanOrEqual(LIMITS.maxAuditScanBytes);
  });
});

describe("R-11: dashboard export and NDJSON feeds are bounded", () => {
  test("serializeAuditExport caps the body and keeps the newest rows", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: i, text: "y".repeat(100) }));
    const result = serializeAuditExport(rows, 2_048);
    expect(result.bytes).toBeLessThanOrEqual(2_048);
    expect(result.truncated).toBe(true);
    expect(result.included).toBeLessThan(rows.length);
    const parsed = JSON.parse(result.body) as Array<{ id: number }>;
    expect(parsed.length).toBe(result.included);
    expect(parsed[parsed.length - 1]!.id).toBe(499);
  });

  test("readNdjsonFileTail honours the row limit and skips malformed lines", async () => {
    const path = join(home, "feed.ndjson");
    await writeFile(
      path,
      [
        JSON.stringify({ n: 1 }),
        "broken",
        JSON.stringify({ n: 2 }),
        JSON.stringify({ n: 3 }),
      ].join("\n") + "\n",
      "utf-8",
    );
    const rows = await readNdjsonFileTail(path, 2, { maxScanBytes: 4_096 });
    expect(rows).toEqual([{ n: 2 }, { n: 3 }]);
  });
});
