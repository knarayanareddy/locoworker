import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ensurePrivateDir, writePrivateFile, assertSafeStatePath } from "@cowork/security/audit";
import { Graph } from "../Graph.js";
import type { GraphSnapshot } from "../types.js";

export class GraphStorage {
  constructor(private readonly outputDir: string) {}

  get jsonPath(): string {
    return join(this.outputDir, "graph.json");
  }

  get reportPath(): string {
    return join(this.outputDir, "GRAPH_REPORT.md");
  }

  async save(snapshot: GraphSnapshot): Promise<void> {
    await this.writePrivate(this.jsonPath, JSON.stringify(snapshot, null, 2));
  }

  async load(): Promise<Graph | null> {
    try {
      const raw = await readFile(this.jsonPath, "utf8");
      const snapshot = JSON.parse(raw) as GraphSnapshot;
      return Graph.fromSnapshot(snapshot);
    } catch {
      return null;
    }
  }

  async loadSnapshot(): Promise<GraphSnapshot | null> {
    try {
      const raw = await readFile(this.jsonPath, "utf8");
      return JSON.parse(raw) as GraphSnapshot;
    } catch {
      return null;
    }
  }

  async writeReport(report: string): Promise<void> {
    await this.writePrivate(this.reportPath, report);
  }

  private async writePrivate(filePath: string, data: string): Promise<void> {
    // Project-local output directory: refuse symlinked state roots and use the
    // shared O_NOFOLLOW writer instead of following a planted link.
    await ensurePrivateDir(this.outputDir);
    await assertSafeStatePath(filePath);
    await writePrivateFile(filePath, data);
  }
}
