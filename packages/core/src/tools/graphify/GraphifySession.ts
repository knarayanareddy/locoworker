import { resolve } from "node:path";
import { Graph, GraphQuery, GraphStorage } from "@cowork/graphify";

/**
 * Per-session holder for the active knowledge graph. Lazily loads from
 * disk if the agent calls GraphifyQuery before GraphifyBuild.
 */
export class GraphifySession {
  private graph: Graph | null = null;
  private query: GraphQuery | null = null;
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  set(graph: Graph, rootDir: string): void {
    this.graph = graph;
    this.query = new GraphQuery(graph);
    this.rootDir = rootDir;
  }

  async ensureLoaded(): Promise<GraphQuery | null> {
    if (this.query) return this.query;
    const out = resolve(this.rootDir, "graphify-out");
    const storage = new GraphStorage(out);
    const loaded = await storage.load();
    if (!loaded) return null;
    this.graph = loaded;
    this.query = new GraphQuery(loaded);
    return this.query;
  }

  hasGraph(): boolean {
    return this.graph !== null;
  }
}
