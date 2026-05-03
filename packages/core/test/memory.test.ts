import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySystem } from "../src/memdir/MemorySystem.js";
import { AutoDream } from "../src/memdir/AutoDream.js";
import { BM25, tokenize } from "../src/memdir/BM25.js";
import { parseFrontmatter, serializeFrontmatter } from "../src/memdir/frontmatter.js";
import { microCompact } from "../src/services/compact/MicroCompact.js";

async function makeSystem() {
  const home = await mkdtemp(join(tmpdir(), "cowork-mem-"));
  const project = await mkdtemp(join(tmpdir(), "cowork-proj-"));
  const mem = new MemorySystem({ projectRoot: project, homeRoot: home });
  await mem.store.init();
  return {
    mem,
    cleanup: async () => {
      await rm(home, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    },
  };
}

describe("frontmatter codec", () => {
  test("round-trips strings, numbers, booleans, arrays", () => {
    const fm = {
      name: "Test entry",
      type: "user",
      tags: ["a", "b two"],
      confidence: 0.85,
      enabled: true,
    };
    const s = serializeFrontmatter(fm);
    const { frontmatter, body } = parseFrontmatter(`${s}body content here\n`);
    expect(frontmatter.name).toBe("Test entry");
    expect(frontmatter.type).toBe("user");
    expect(frontmatter.tags).toEqual(["a", "b two"]);
    expect(frontmatter.confidence).toBe(0.85);
    expect(frontmatter.enabled).toBe(true);
    // Parser preserves body whitespace; consumers (MemoryStore) trim.
    expect(body.trim()).toBe("body content here");
  });
});

describe("MemorySystem CRUD", () => {
  test("save → list → query → delete round-trip", async () => {
    const { mem, cleanup } = await makeSystem();
    try {
      const a = await mem.save({
        type: "feedback",
        name: "Use TypeScript strict mode",
        description: "Always enable strict everywhere",
        body: "We use strict TypeScript across the whole repo. Reason: caught a class of bugs in Q4.",
        tags: ["typescript"],
        sessionId: "s1",
        confidence: 1,
      });
      const b = await mem.save({
        type: "project",
        name: "Migration deadline",
        description: "Database migration must ship by 2026-06-01",
        body: "We're moving from Postgres 14 → 16 by June 1, 2026.",
        tags: ["db"],
        sessionId: "s1",
        confidence: 1,
      });

      const all = await mem.list();
      expect(all).toHaveLength(2);

      const onlyFeedback = await mem.list({ type: "feedback" });
      expect(onlyFeedback.map((e) => e.id)).toEqual([a.id]);

      const queryResults = await mem.query("typescript strict", 5);
      expect(queryResults[0]?.entry.id).toBe(a.id);

      const indexed = await readFile(mem.index.path, "utf8");
      expect(indexed).toContain("Use TypeScript strict mode");
      expect(indexed).toContain("Migration deadline");

      const deleted = await mem.delete("project", b.id);
      expect(deleted).toBe(true);
      expect((await mem.list()).map((e) => e.id)).toEqual([a.id]);
    } finally {
      await cleanup();
    }
  });

  test("MEMORY.md is capped at 200 lines", async () => {
    const { mem, cleanup } = await makeSystem();
    try {
      for (let i = 0; i < 250; i++) {
        await mem.save({
          type: "reference",
          name: `Ref ${i}`,
          description: `Pointer number ${i} for testing the index cap.`,
          body: `body ${i}`,
          tags: [],
          sessionId: null,
          confidence: 1,
        });
      }
      const idx = await mem.readIndex();
      const lines = idx.split("\n");
      expect(lines.length).toBeLessThanOrEqual(200);
    } finally {
      await cleanup();
    }
  });
});

describe("BM25 ranking", () => {
  test("ranks exact-match docs above unrelated docs", () => {
    const corpus = [
      { doc: 1, text: "TypeScript strict mode is enabled across the repo" },
      { doc: 2, text: "We deploy via Kubernetes and Helm charts" },
      { doc: 3, text: "Strict mode in TypeScript catches null bugs early" },
    ];
    const bm25 = new BM25(corpus);
    const results = bm25.search("typescript strict", 3);
    expect(results.length).toBeGreaterThan(0);
    expect([1, 3]).toContain(results[0]?.doc);
    expect(results[0]?.doc).not.toBe(2);
  });

  test("tokenize drops stopwords and punctuation", () => {
    const tokens = tokenize("The agent is in the working directory!");
    expect(tokens).toContain("agent");
    expect(tokens).toContain("working");
    expect(tokens).toContain("directory");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("is");
  });
});

describe("MicroCompact", () => {
  test("leaves short content untouched", () => {
    const out = microCompact("hello world");
    expect(out).toBe("hello world");
  });
  test("trims long content to under the budget", () => {
    const big = "x".repeat(20_000);
    const out = microCompact(big, { maxChars: 1_000 });
    expect(out.length).toBeLessThan(1_500);
    expect(out).toContain("elided by MicroCompact");
  });
});

describe("AutoDream", () => {
  test("merges duplicates and rebuilds the index", async () => {
    const { mem, cleanup } = await makeSystem();
    try {
      await mem.save({
        type: "user",
        name: "Senior Go engineer",
        description: "User has 10y of Go experience",
        body: "User is a senior Go engineer",
        tags: [],
        sessionId: null,
        confidence: 1,
      });
      await mem.save({
        type: "user",
        name: "Senior Go engineer (dup)",
        description: "Duplicate of the above",
        body: "User is a senior Go engineer", // identical body
        tags: [],
        sessionId: null,
        confidence: 0.5,
      });

      const dream = new AutoDream(mem);
      const report = await dream.consolidate();
      expect(report.duplicatesMerged).toBe(1);
      expect(report.finalCount).toBe(1);
      expect(report.scanned).toBe(2);
    } finally {
      await cleanup();
    }
  });

  test("datestamps relative dates in body text", async () => {
    const { mem, cleanup } = await makeSystem();
    try {
      const saved = await mem.save({
        type: "project",
        name: "Recent change",
        description: "Decision made yesterday about the schema",
        body: "Yesterday we decided to drop the legacy table.",
        tags: [],
        sessionId: null,
        confidence: 1,
      });
      const dream = new AutoDream(mem);
      const report = await dream.consolidate();
      expect(report.datestampsFixed).toBe(1);
      const after = await mem.list({ type: "project" });
      const found = after.find((e) => e.id === saved.id);
      expect(found?.body.toLowerCase()).toMatch(/yesterday \(/);
    } finally {
      await cleanup();
    }
  });
});
