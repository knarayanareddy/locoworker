import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
    await mkdir(dirname(this.jsonPath), { recursive: true });
    await writeFile(this.jsonPath, JSON.stringify(snapshot, null, 2), "utf8");
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
    await mkdir(dirname(this.reportPath), { recursive: true });
    await writeFile(this.reportPath, report, "utf8");
  }
}
