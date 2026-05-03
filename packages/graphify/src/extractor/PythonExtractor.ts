import {
  type Extractor,
  type ExtractionContext,
  type ExtractionResult,
  fileNodeId,
  symbolNodeId,
} from "./Extractor.js";
import type { GraphEdge, GraphNode } from "../types.js";

export class PythonExtractor implements Extractor {
  readonly language = "python";
  readonly extensions = [".py", ".pyw"] as const;

  extract(ctx: ExtractionContext): ExtractionResult {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const cleaned = stripPyComments(ctx.source);

    const defRe = /(?:^|\n)(\s*)(?:async\s+)?def\s+([A-Za-z_][\w]*)/g;
    let match: RegExpExecArray | null;
    while ((match = defRe.exec(cleaned)) !== null) {
      const indent = match[1] ?? "";
      const name = match[2];
      if (!name) continue;
      const kind: GraphNode["kind"] = indent.length > 0 ? "method" : "function";
      const line = lineNumberAt(cleaned, match.index);
      const id = symbolNodeId(ctx.relPath, kind, name, line);
      nodes.push({ id, kind, name, path: ctx.relPath, line, language: "python" });
      edges.push({
        source: ctx.fileNodeId,
        target: id,
        kind: "contains",
        provenance: "EXTRACTED",
        weight: 1,
      });
    }

    const classRe = /(?:^|\n)\s*class\s+([A-Za-z_][\w]*)\s*(\([^)]*\))?\s*:/g;
    while ((match = classRe.exec(cleaned)) !== null) {
      const name = match[1];
      if (!name) continue;
      const line = lineNumberAt(cleaned, match.index);
      const id = symbolNodeId(ctx.relPath, "class", name, line);
      nodes.push({ id, kind: "class", name, path: ctx.relPath, line, language: "python" });
      edges.push({
        source: ctx.fileNodeId,
        target: id,
        kind: "contains",
        provenance: "EXTRACTED",
        weight: 1,
      });
      // Inheritance — bases inside the parens.
      const bases = match[2];
      if (bases) {
        for (const baseName of parseBases(bases)) {
          edges.push({
            source: id,
            target: `class:?:${baseName}@?`,
            kind: "extends",
            provenance: "INFERRED",
            weight: 1,
            detail: baseName,
          });
        }
      }
    }

    const importRe = /(?:^|\n)\s*(?:from\s+([\w.]+)\s+import\s+[\w*,\s]+|import\s+([\w.]+))/g;
    while ((match = importRe.exec(cleaned)) !== null) {
      const target = match[1] || match[2];
      if (!target) continue;
      edges.push({
        source: ctx.fileNodeId,
        target: fileNodeId(target.replace(/\./g, "/") + ".py"),
        kind: "imports",
        provenance: "INFERRED",
        weight: 1,
        detail: target,
      });
    }

    return { nodes, edges };
  }
}

function stripPyComments(source: string): string {
  // Remove line comments, leave triple-quoted strings alone (they often
  // contain definition-like text but they're docstrings, not code).
  return source.replace(/#[^\n]*/g, (m) => " ".repeat(m.length));
}

function parseBases(parens: string): string[] {
  const inside = parens.slice(1, -1);
  if (!inside.trim()) return [];
  const out: string[] = [];
  for (const seg of inside.split(",")) {
    const trimmed = seg.trim().split("=")[0]?.trim();
    if (trimmed && /^[A-Za-z_][\w.]*$/.test(trimmed)) out.push(trimmed);
  }
  return out;
}

function lineNumberAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}
