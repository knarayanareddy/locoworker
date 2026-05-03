import type { GraphEdge, GraphNode } from "../types.js";

export type ExtractionResult = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type ExtractionContext = {
  /** Project-relative file path (forward-slashed). */
  relPath: string;
  /** Absolute path on disk. */
  absPath: string;
  /** UTF-8 source. */
  source: string;
  /** File-level node id (already inserted). */
  fileNodeId: string;
};

/**
 * Per-language extractor. A future Tree-sitter implementation slots in
 * behind this interface without touching the builder.
 *
 * Phase 3 ships regex extractors for TS/JS, Python, and Markdown — the
 * three languages this codebase actually contains. Adding more is purely
 * additive: implement an Extractor and register it in `registry.ts`.
 */
export interface Extractor {
  readonly language: string;
  readonly extensions: readonly string[];
  extract(ctx: ExtractionContext): ExtractionResult;
}

export function fileNodeId(relPath: string): string {
  return `file:${relPath}`;
}

export function symbolNodeId(relPath: string, kind: string, name: string, line: number): string {
  return `${kind}:${relPath}:${name}@${line}`;
}
