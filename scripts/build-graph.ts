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
  await storage.save(result.snapshot);

  const report = buildGraphReport(result, root);
  await storage.writeReport(report);
  // Keep the root-level report in sync (handy for agents/CLAUDE.md context).
  await writeFile(resolve(root, "GRAPH_REPORT.md"), report);

  console.log(`Graph built: ${result.filesProcessed} files, ${result.nodesCreated} nodes, ${result.edgesCreated} edges.`);
  console.log(`Results saved to ${outDir}`);
}

main().catch((e) => {
  console.error(`[build:graph] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
