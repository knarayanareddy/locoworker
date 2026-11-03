/**
 * Walks a project, runs the registered (regex-based) extractors and builds
 * a queryable Graph snapshot. This is the module that was missing from the
 * repository: `@cowork/graphify`, `scripts/build-graph.ts` and the CLI's
 * GraphifyBuild tool all import from here.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { Graph } from "../Graph.js";
import type { GraphEdge, GraphMetadata, GraphNode, GraphSnapshot } from "../types.js";
import { fileNodeId, type ExtractionContext } from "../extractor/Extractor.js";
import { ExtractorRegistry, defaultExtractorRegistry } from "../extractor/ExtractorRegistry.js";

export interface BuildOptions {
  rootDir: string;
  /** Extra directory names to skip. */
  exclude?: string[];
  /** Skip files larger than this (default 512 KiB). */
  maxFileBytes?: number;
  registry?: ExtractorRegistry;
}

export interface BuildResult {
  graph: Graph;
  snapshot: GraphSnapshot;
  filesProcessed: number;
  filesSkipped: number;
  nodesCreated: number;
  edgesCreated: number;
  byLanguage: Record<string, number>;
  totalSourceBytes: number;
  durationMs: number;
}

const DEFAULT_EXCLUDE = new Set([
  ".git", "node_modules", "dist", "build", "coverage", ".next", ".turbo",
  ".cache", ".npm-cache", ".venv", "__pycache__", "target", "out", "vendor",
]);

function dirNodeId(relPath: string): string {
  return `dir:${relPath || "."}`;
}

export class KnowledgeGraphBuilder {
  private readonly registry: ExtractorRegistry;
  private readonly exclude: Set<string>;
  private readonly maxFileBytes: number;

  constructor(options: { registry?: ExtractorRegistry; exclude?: string[]; maxFileBytes?: number } = {}) {
    this.registry = options.registry ?? defaultExtractorRegistry;
    this.exclude = new Set([...DEFAULT_EXCLUDE, ...(options.exclude ?? [])]);
    this.maxFileBytes = options.maxFileBytes ?? 512 * 1024;
  }

  async build(options: BuildOptions): Promise<BuildResult> {
    const started = Date.now();
    const root = resolve(options.rootDir);
    const graph = new Graph();
    const pendingEdges: GraphEdge[] = [];
    const byLanguage: Record<string, number> = {};
    let filesProcessed = 0;
    let filesSkipped = 0;
    let totalSourceBytes = 0;

    const files = await this.walk(root);
    // Deterministic output makes graph.json diffable.
    files.sort();

    for (const absPath of files) {
      const relPath = relative(root, absPath).split(sep).join("/");
      try {
        const info = await stat(absPath);
        if (!info.isFile() || info.size > this.maxFileBytes) {
          filesSkipped++;
          continue;
        }
        const source = await readFile(absPath, "utf8");
        totalSourceBytes += Buffer.byteLength(source, "utf8");
        const extractor = this.registry.resolve(relPath);
        if (!extractor) {
          filesSkipped++;
          continue;
        }

        const fid = fileNodeId(relPath);
        graph.upsertNode({
          id: fid,
          kind: "file",
          name: basename(relPath),
          path: relPath,
          language: extractor.language,
        });
        this.linkDirectories(graph, relPath);
        byLanguage[extractor.language] = (byLanguage[extractor.language] ?? 0) + 1;

        const ctx: ExtractionContext = { relPath, absPath, source, fileNodeId: fid };
        const extracted = extractor.extract(ctx);
        for (const node of extracted.nodes) graph.upsertNode(node);
        pendingEdges.push(...extracted.edges);
        filesProcessed++;
      } catch {
        filesSkipped++;
      }
    }

    // Import/link targets are often bare specifiers ("react", "../utils").
    // Materialise them as module nodes so the edges survive Graph.addEdge,
    // which requires both endpoints to exist.
    for (const edge of pendingEdges) {
      if (edge.target.startsWith("file:") && !graph.hasNode(edge.target)) {
        const name = edge.target.slice("file:".length);
        graph.upsertNode({ id: edge.target, kind: "module", name, language: "external" });
      }
    }
    for (const edge of pendingEdges) graph.addEdge(edge);

    const metadata: GraphMetadata = {
      builtAt: new Date().toISOString(),
      // Keep the snapshot portable: never embed an absolute home directory.
      rootDir: basename(root),
      fileCount: filesProcessed,
      nodeCount: graph.nodeCount(),
      edgeCount: graph.edgeCount(),
      languages: Object.keys(byLanguage).sort(),
      totalSourceBytes,
    };

    return {
      graph,
      snapshot: graph.toSnapshot(metadata),
      filesProcessed,
      filesSkipped,
      nodesCreated: graph.nodeCount(),
      edgesCreated: graph.edgeCount(),
      byLanguage,
      totalSourceBytes,
      durationMs: Date.now() - started,
    };
  }

  private async walk(root: string): Promise<string[]> {
    const out: string[] = [];
    const queue: string[] = [root];
    while (queue.length > 0) {
      const dir = queue.pop()!;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (this.exclude.has(entry.name) || entry.isSymbolicLink()) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) queue.push(full);
        else if (entry.isFile()) out.push(full);
      }
    }
    return out;
  }

  private linkDirectories(graph: Graph, relPath: string): void {
    const parts = relPath.split("/");
    let parent = dirNodeId("");
    graph.upsertNode({ id: parent, kind: "directory", name: ".", path: "" });
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;
      const id = isFile ? fileNodeId(relPath) : dirNodeId(path);
      if (!isFile) {
        graph.upsertNode({ id, kind: "directory", name: parts[i]!, path });
      }
      graph.addEdge({
        source: parent,
        target: id,
        kind: "contains",
        provenance: "EXTRACTED",
        weight: 1,
      });
      parent = id;
    }
  }
}
