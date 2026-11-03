import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KnowledgeGraphBuilder, buildGraphReport } from "../src/build/index.js";

describe("KnowledgeGraphBuilder", () => {
  test("walks a project and produces a portable snapshot with real nodes/edges", async () => {
    const root = await mkdtemp(join(tmpdir(), "cowork-graphify-"));
    try {
      await mkdir(join(root, "src"), { recursive: true });
      await mkdir(join(root, "node_modules"), { recursive: true });
      await writeFile(join(root, "src", "index.ts"),
        'import { thing } from "./thing";\nexport function main() { return thing(); }\n', "utf-8");
      await writeFile(join(root, "src", "thing.ts"),
        "export class Thing {}\nexport const answer = 42;\n", "utf-8");
      await writeFile(join(root, "README.md"), "# Demo\n\nSee [thing](src/thing.ts).\n", "utf-8");
      await writeFile(join(root, "node_modules", "ignored.ts"), "export function nope() {}\n", "utf-8");

      const result = await new KnowledgeGraphBuilder().build({ rootDir: root });
      expect(result.filesProcessed).toBe(3); // src/*.ts + README.md, never node_modules
      expect(result.snapshot.metadata.rootDir).not.toContain("/");
      expect(result.snapshot.nodes.some((n) => n.name === "main" && n.kind === "function")).toBe(true);
      expect(result.snapshot.nodes.some((n) => n.kind === "class" && n.name === "Thing")).toBe(true);
      expect(result.snapshot.nodes.some((n) => n.name === "ignored.ts")).toBe(false);
      expect(result.snapshot.edges.some((e) => e.kind === "imports")).toBe(true);
      expect(result.snapshot.edges.some((e) => e.kind === "contains")).toBe(true);
      expect(result.totalSourceBytes).toBeGreaterThan(0);

      const report = buildGraphReport(result, root);
      expect(report).toContain("Build Summary");
      expect(report).toContain("typescript");
      expect(report).not.toContain(root); // no absolute developer paths
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
