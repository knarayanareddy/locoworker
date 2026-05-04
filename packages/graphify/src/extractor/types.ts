import type { GraphNode, GraphEdge } from "../types";

export interface ExtractResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Extractor {
  extract(content: string, filePath: string): ExtractResult;
}
