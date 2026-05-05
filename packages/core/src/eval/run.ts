/**
 * Eval harness runner.
 * Usage: bun run packages/core/src/eval/run.ts [--dir .cowork/evals] [--provider anthropic] [--model claude-sonnet-4-5]
 */
import { join, resolve } from "node:path";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { resolveProvider, resolveSettings, DEFAULT_TOOLS } from "../index.js";
import { QueryEngine } from "../QueryEngine.js";
import { EvalRunner } from "./EvalRunner.js";
import type { EvalCase, EvalSuiteResult } from "./types.js";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    dir:      { type: "string",  default: ".cowork/evals" },
    provider: { type: "string" },
    model:    { type: "string" },
    output:   { type: "string",  default: ".cowork/eval-results" },
    verbose:  { type: "boolean", default: false },
  },
  strict: false,
});

const cwd = process.cwd();
const evalsDir = resolve(cwd, values.dir as string);
const outputDir = resolve(cwd, values.output as string);

if (!existsSync(evalsDir)) {
  console.error(`Evals directory not found: ${evalsDir}`);
  console.error(`Create .cowork/evals/ and add *.eval.json files.`);
  process.exit(1);
}

const settings = await resolveSettings(cwd, process.env);

const provider = resolveProvider({
  provider: (values.provider as any) ?? settings.provider,
  model: (values.model as string) ?? settings.model,
  apiKey: settings.apiKey,
  baseUrl: settings.baseUrl,
  env: process.env as Record<string, string>,
});

const engine = new QueryEngine(provider);
const runner = new EvalRunner(engine, DEFAULT_TOOLS, settings.systemPrompt ?? "");

await mkdir(outputDir, { recursive: true });

// Discover eval suite files
const files = (await readdir(evalsDir)).filter(
  (f) => f.endsWith(".eval.json") || f.endsWith(".eval.ts")
);

if (files.length === 0) {
  console.error(`No .eval.json files found in ${evalsDir}`);
  process.exit(1);
}

let totalPassed = 0;
let totalFailed = 0;
const allResults: EvalSuiteResult[] = [];

for (const file of files) {
  const suiteName = file.replace(/\.eval\.(json|ts)$/, "");
  const filePath = join(evalsDir, file);

  let cases: EvalCase[];
  try {
    const raw = await readFile(filePath, "utf-8");
    cases = JSON.parse(raw) as EvalCase[];
  } catch (err) {
    console.error(`Failed to load ${file}: ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }

  console.log(`\n▶ Suite: ${suiteName} (${cases.length} cases)`);

  const result = await runner.runSuite(suiteName, cases, {
    provider: (values.provider as string) ?? settings.provider,
    model: (values.model as string) ?? settings.model ?? "unknown",
  });

  allResults.push(result);
  totalPassed += result.passed;
  totalFailed += result.failed;

  // Persist results
  const outPath = join(outputDir, `${suiteName}-${Date.now()}.json`);
  await writeFile(outPath, JSON.stringify(result, null, 2), "utf-8");

  const passRate = (result.passRate * 100).toFixed(1);
  console.log(`  Pass rate: ${passRate}% (${result.passed}/${result.totalCases})`);
  console.log(`  Tokens: ${result.totalInputTokens + result.totalOutputTokens}`);
  console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);

  if (values.verbose) {
    for (const r of result.results) {
      const icon = r.passed ? "  ✓" : "  ✗";
      console.log(`${icon} [${r.caseId}]`);
      if (!r.passed && r.failures.length > 0) {
        for (const f of r.failures) {
          console.log(`    - ${f}`);
        }
      }
    }
  }
}

console.log(`\n${"═".repeat(50)}`);
console.log(`Total: ${totalPassed + totalFailed} cases  ✓ ${totalPassed}  ✗ ${totalFailed}`);
console.log(`Results saved to: ${outputDir}`);

process.exit(totalFailed > 0 ? 1 : 0);
