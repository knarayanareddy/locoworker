import { KnowledgeGraphBuilder, buildGraphReport, GraphStorage } from "@cowork/graphify";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const root = process.cwd();
  const outDir = resolve(root, "graphify-out");
  
  console.log(`Building graph for ${root}...`);
  const builder = new KnowledgeGraphBuilder();
  const result = await builder.build({ rootDir: root });
  
  const storage = new GraphStorage(outDir);
  const snapshot = result.graph.toSnapshot({
    builtAt: new Date().toISOString(),
    rootDir: root,
    fileCount: result.filesProcessed,
    nodeCount: result.nodesCreated,
    edgeCount: result.edgesCreated,
    languages: [],
    totalSourceBytes: 0,
  });
  
  await storage.save(snapshot);
  
  const report = buildGraphReport(result, root);
  await writeFile(resolve(root, "GRAPH_REPORT.md"), report);
  
  console.log(`Graph built: ${result.filesProcessed} files, ${result.nodesCreated} nodes, ${result.edgesCreated} edges.`);
  console.log(`Results saved to ${outDir}`);
}

main().catch(console.error);
