import {
  type Extractor,
  type ExtractionContext,
  type ExtractionResult,
  fileNodeId,
  symbolNodeId,
} from "./Extractor.js";
import type { GraphEdge, GraphNode } from "../types.js";

/**
 * Markdown extraction: pulls headings as concept nodes and intra-doc
 * links as 'references' edges. Linked .md or source files become
 * 'documents' edges so docs nest into the same graph as code.
 */
export class MarkdownExtractor implements Extractor {
  readonly language = "markdown";
  readonly extensions = [".md", ".mdx"] as const;

  extract(ctx: ExtractionContext): ExtractionResult {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    const headingRe = /^(#{1,6})\s+(.+?)\s*$/gm;
    let match: RegExpExecArray | null;
    while ((match = headingRe.exec(ctx.source)) !== null) {
      const heading = match[2];
      if (!heading) continue;
      const line = lineNumberAt(ctx.source, match.index);
      const id = symbolNodeId(ctx.relPath, "concept", slug(heading), line);
      nodes.push({
        id,
        kind: "concept",
        name: heading,
        path: ctx.relPath,
        line,
        language: "markdown",
        summary: heading,
      });
      edges.push({
        source: ctx.fileNodeId,
        target: id,
        kind: "contains",
        provenance: "EXTRACTED",
        weight: 1,
      });
    }

    const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    while ((match = linkRe.exec(ctx.source)) !== null) {
      const target = match[2];
      if (!target || target.startsWith("http") || target.startsWith("#")) continue;
      edges.push({
        source: ctx.fileNodeId,
        target: fileNodeId(target),
        kind: "references",
        provenance: "EXTRACTED",
        weight: 1,
        detail: target,
      });
    }

    return { nodes, edges };
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function lineNumberAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}
