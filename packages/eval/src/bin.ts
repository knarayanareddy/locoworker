#!/usr/bin/env bun
/**
 * cowork-eval — run evaluation suites
 *
 * Usage:
 *   cowork-eval                          (run all built-in suites)
 *   cowork-eval --suite core             (run named suite)
 *   cowork-eval --file my-suite.json     (run suite from JSON file)
 *   cowork-eval --provider openai --model gpt-4o-mini
 *   cowork-eval --output results.md      (write markdown report)
 *   cowork-eval --ci                     (exit 1 on any failure)
 */

import { EvalRunner } from "./EvalRunner";
import { Reporter } from "./Reporter";
import { BUILTIN_SUITES } from "./builtinSuites";
import type { EvalSuite } from "./types";

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const suiteName = getArg("--suite");
const suiteFile = getArg("--file");
const provider = getArg("--provider") ?? process.env.COWORK_PROVIDER ?? "ollama";
const model = getArg("--model") ?? process.env.COWORK_MODEL ?? "qwen2.5-coder:7b";
const outputFile = getArg("--output");
const ciMode = args.includes("--ci");
const projectRoot = getArg("--project") ?? process.cwd();

let suites: EvalSuite[] = BUILTIN_SUITES;

if (suiteFile) {
  const raw = await Bun.file(suiteFile).text();
  suites = [JSON.parse(raw) as EvalSuite];
} else if (suiteName) {
  const found = BUILTIN_SUITES.find((s) => s.name === suiteName);
  if (!found) {
    console.error(`Suite "${suiteName}" not found. Available: ${BUILTIN_SUITES.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }
  suites = [found];
}

let anyFailed = false;

for (const suite of suites) {
  suite.provider = provider;
  suite.model = model;

  const runner = new EvalRunner(suite);
  console.log(`\nRunning suite: ${suite.name}`);

  const result = await runner.run((r) => {
    const icon = r.passed ? "✓" : "✗";
    process.stdout.write(`  ${icon} ${r.description}\n`);
  });

  Reporter.printSummary(result);

  if (result.failed > 0) anyFailed = true;

  if (outputFile) {
    const markdown = Reporter.toMarkdown(result);
    await Bun.write(outputFile, markdown);
    console.log(`Report written to ${outputFile}`);
  }

  await Reporter.persistToProject(result, projectRoot);
}

if (ciMode && anyFailed) {
  console.error("CI mode: failing due to test failures");
  process.exit(1);
}
