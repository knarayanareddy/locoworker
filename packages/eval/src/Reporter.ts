import type { SuiteResult } from "./types";
import { MemorySystem } from "@cowork/core";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export class Reporter {
  static toMarkdown(result: SuiteResult): string {
    const passIcon = (p: boolean) => (p ? "✅" : "❌");
    const pct = (n: number, total: number) =>
      total > 0 ? `${((n / total) * 100).toFixed(0)}%` : "0%";

    const lines = [
      `# Eval Report: ${result.suiteName}`,
      `**Run at:** ${result.runAt}`,
      `**Pass rate:** ${pct(result.passed, result.totalCases)} (${result.passed}/${result.totalCases})`,
      `**Duration:** ${(result.totalDurationMs / 1000).toFixed(1)}s`,
      "",
      "## Results",
      "",
      "| # | Case | Pass | Duration | Cost | Turns |",
      "|---|------|------|----------|------|-------|",
      ...result.results.map((r, i) =>
        `| ${i + 1} | ${r.description.slice(0, 40)} | ${passIcon(r.passed)} | ${(r.durationMs / 1000).toFixed(1)}s | $${r.output.estimatedCostUsd.toFixed(4)} | ${r.output.turns} |`
      ),
      "",
      "## Case Details",
      "",
      ...result.results.flatMap((r) => [
        `### ${passIcon(r.passed)} Case: ${r.description}`,
        `**ID:** \`${r.caseId}\``,
        "",
        "**Assertions:**",
        ...r.assertionResults.map(
          (a) => `- ${passIcon(a.passed)} \`${a.assertion.type}\`${a.reason ? ` — ${a.reason}` : ""}`
        ),
        "",
        r.output.error ? `**Error:** ${r.output.error}` : "",
        r.output.toolsCalled.length > 0
          ? `**Tools called:** ${r.output.toolsCalled.join(", ")}`
          : "",
        "",
      ]),
    ];

    return lines.filter((l) => l !== undefined).join("\n");
  }

  static toJSON(result: SuiteResult): string {
    return JSON.stringify(result, null, 2);
  }

  static printSummary(result: SuiteResult): void {
    const pct = ((result.passed / result.totalCases) * 100).toFixed(0);
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Eval Suite: ${result.suiteName}`);
    console.log(`Pass rate:  ${pct}% (${result.passed}/${result.totalCases})`);
    console.log(`Duration:   ${(result.totalDurationMs / 1000).toFixed(1)}s`);
    console.log("─".repeat(60));
    for (const r of result.results) {
      const icon = r.passed ? "✓" : "✗";
      const failed = r.assertionResults.filter((a) => !a.passed);
      console.log(
        `  ${icon} ${r.description.padEnd(50)} ${r.passed ? "" : `→ ${failed[0]?.reason ?? ""}`}`
      );
    }
    console.log("─".repeat(60) + "\n");
  }

  static async persistToProject(
    result: SuiteResult,
    projectRoot: string
  ): Promise<string> {
    const dir = path.join(MemorySystem.rootFor(projectRoot), "eval-results");
    await mkdir(dir, { recursive: true });
    const filename = `${result.suiteName.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}.json`;
    const filePath = path.join(dir, filename);
    await Bun.write(filePath, Reporter.toJSON(result));
    return filePath;
  }
}
