// packages/graphify/src/index.ts
// Phase 5: build/ layer now exists — exports are no longer broken.

export { Graph }                  from "./Graph.js";
export type { GraphSnapshot }     from "./types.js";
export { GraphQuery }             from "./query/GraphQuery.js";
export { GraphStorage }           from "./storage/GraphStorage.js";
export { detectCommunities }      from "./cluster/Louvain.js";
export { pageRank }               from "./cluster/PageRank.js";
export { defaultExtractorRegistry } from "./extractor/registry.js";

// Phase 3/5: builder layer (now implemented)
export { KnowledgeGraphBuilder }  from "./build/KnowledgeGraphBuilder.js";
export type { BuildOptions, BuildResult } from "./build/KnowledgeGraphBuilder.js";
export { buildGraphReport }       from "./build/GraphReport.js";
export type { ReportOptions }     from "./build/GraphReport.js";
