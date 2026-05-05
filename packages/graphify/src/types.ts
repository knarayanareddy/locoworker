/**
 * Knowledge-graph node and edge types.
 *
 * Spec PART 10. We follow the EXTRACTED / INFERRED / AMBIGUOUS taxonomy
 * so callers always know whether an edge came directly from source or
 * was deduced.
 */

export type NodeKind =
  | "file"
  | "directory"
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type"
  | "module"
  | "concept";

export type EdgeKind =
  | "contains"
  | "imports"
  | "calls"
  | "extends"
  | "implements"
  | "references"
  | "documents";

export type RelationProvenance = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

export type GraphNode = {
  id: string;
  kind: NodeKind;
  name: string;
  /** Project-relative path. */
  path?: string;
  /** 1-indexed line if applicable. */
  line?: number;
  language?: string;
  /** Free-form text used for full-text search. */
  summary?: string;
  /** Cluster id assigned by community detection. */
  community?: number;
  /** PageRank-style centrality score, [0,1]. */
  centrality?: number;
  confidence?: number;
  provenance?: RelationProvenance;
};

export type GraphEdge = {
  source: string;
  target: string;
  kind: EdgeKind;
  provenance: RelationProvenance;
  weight: number;
  /** Optional metadata — e.g. "import path", "call site". */
  detail?: string;
  confidence?: number;
};

export type GraphMetadata = {
  builtAt: string;
  rootDir: string;
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  languages: string[];
  /** "before" file-byte total used for the token-reduction summary. */
  totalSourceBytes: number;
};

export type GraphSnapshot = {
  metadata: GraphMetadata;
  nodes: GraphNode[];
  edges: GraphEdge[];
};
