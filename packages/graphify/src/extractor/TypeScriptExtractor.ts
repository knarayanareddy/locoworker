import {
  type Extractor,
  type ExtractionContext,
  type ExtractionResult,
  fileNodeId,
  symbolNodeId,
} from "./Extractor.js";
import type { GraphEdge, GraphNode } from "../types.js";

/**
 * TypeScript / JavaScript extractor.
 *
 * Pragmatic regex-based extraction — captures the structure that matters
 * for graph navigation (functions, classes, exported symbols, imports)
 * without the weight of a full AST. Edges are tagged INFERRED when we're
 * pattern-matching call sites; structural definitions are EXTRACTED.
 */
export class TypeScriptExtractor implements Extractor {
  readonly language = "typescript";
  readonly extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;

  extract(ctx: ExtractionContext): ExtractionResult {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const stripped = stripCommentsAndStrings(ctx.source);

    extractDefinitions(ctx, stripped, nodes, edges);
    extractImports(ctx, stripped, edges);

    return { nodes, edges };
  }
}

const DEFINITION_PATTERNS: { kind: GraphNode["kind"]; regex: RegExp }[] = [
  // Function declarations: function foo() { … }
  {
    kind: "function",
    regex: /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  },
  // Arrow functions assigned to a const/let/var.
  {
    kind: "function",
    regex:
      /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=][^=][^\n]*?(?:=>|function)/g,
  },
  // Classes and interfaces.
  {
    kind: "class",
    regex: /(?:^|\n)\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
  },
  {
    kind: "interface",
    regex: /(?:^|\n)\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g,
  },
  // Type aliases.
  {
    kind: "type",
    regex: /(?:^|\n)\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g,
  },
];

function extractDefinitions(
  ctx: ExtractionContext,
  source: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): void {
  for (const { kind, regex } of DEFINITION_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      const name = match[1];
      if (!name) continue;
      const line = lineNumberAt(source, match.index);
      const id = symbolNodeId(ctx.relPath, kind, name, line);
      nodes.push({
        id,
        kind,
        name,
        path: ctx.relPath,
        line,
        language: "typescript",
      });
      edges.push({
        source: ctx.fileNodeId,
        target: id,
        kind: "contains",
        provenance: "EXTRACTED",
        weight: 1,
      });
    }
  }
}

const IMPORT_PATTERNS: RegExp[] = [
  // import … from "x"
  /^\s*import\s[^"';]*?from\s+['"]([^'"]+)['"]/gm,
  // import "x"
  /^\s*import\s+['"]([^'"]+)['"]/gm,
  // dynamic import("x")
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  // require("x")
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function extractImports(
  ctx: ExtractionContext,
  source: string,
  edges: GraphEdge[],
): void {
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const target = match[1];
      if (!target) continue;
      edges.push({
        source: ctx.fileNodeId,
        target: fileNodeId(target),
        kind: "imports",
        provenance: "EXTRACTED",
        weight: 1,
        detail: target,
      });
    }
  }
}

/**
 * Replace comments with whitespace so our definition regexes don't fire
 * inside them. String literals are left intact because the import-path
 * patterns need their contents. Preserves byte offsets so line numbers
 * stay accurate.
 *
 * False-positive risk (a docstring-like string containing
 * `function foo(...)` triggering a phantom definition) is low enough
 * to ignore at this scope.
 */
function stripCommentsAndStrings(source: string): string {
  let result = "";
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source[i];
    const nx = source[i + 1];

    if (ch === "/" && nx === "/") {
      while (i < len && source[i] !== "\n") {
        result += " ";
        i++;
      }
      continue;
    }
    if (ch === "/" && nx === "*") {
      while (i + 1 < len && !(source[i] === "*" && source[i + 1] === "/")) {
        result += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i + 1 < len) {
        result += "  ";
        i += 2;
      }
      continue;
    }
    if (ch !== undefined) result += ch;
    i++;
  }

  return result;
}

function lineNumberAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

/**
 * Internal helper exposed for two-pass extractors that need the same
 * stripping logic for sibling formats.
 */
export const _internals = { stripCommentsAndStrings, lineNumberAt };
