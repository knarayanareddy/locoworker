import type { EvalCase, EvalResult, EvalSuiteResult } from "./types.js";
import type { QueryEngine } from "../QueryEngine.js";
import type { ToolDefinition } from "../Tool.js";
import { queryLoop } from "../queryLoop.js";

export class EvalRunner {
  constructor(
    private engine: QueryEngine,
    private tools: ToolDefinition[],
    private systemPrompt: string
  ) {}

  async runCase(evalCase: EvalCase): Promise<EvalResult> {
    const start = Date.now();
    const toolCallsActual: Array<{ name: string; input: unknown }> = [];
    let finalText = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      for await (const event of queryLoop(evalCase.prompt, {
        engine: this.engine,
        systemPrompt: evalCase.systemPrompt ?? this.systemPrompt,
        tools: this.tools,
        maxTurns: evalCase.maxTurns ?? 10,
        requestApproval: async () => true, // Auto-approve in eval
      })) {
        // Log event for debugging
        // console.error(`[EVAL DEBUG] Event: ${event.type}`, event);

        if (event.type === "tool_call") {
          toolCallsActual.push({ name: event.name, input: event.input });
        }
        if (event.type === "text") {
          finalText += event.text;
        }
        if (event.type === "complete") {
          totalInputTokens = event.usage?.inputTokens ?? 0;
          totalOutputTokens = event.usage?.outputTokens ?? 0;
          // Capture text from complete event if finalText is still empty
          if (!finalText && event.text) {
            finalText = event.text;
          }
        }
      }
    } catch (err) {
      return {
        caseId: evalCase.id,
        passed: false,
        score: 0,
        failures: [`Agent threw: ${err instanceof Error ? err.message : String(err)}`],
        toolCallsActual,
        finalText,
        totalInputTokens,
        totalOutputTokens,
        durationMs: Date.now() - start,
      };
    }

    const failures: string[] = [];

    // Check expected tool calls
    for (const expected of evalCase.expectedToolCalls ?? []) {
      const found = toolCallsActual.some((actual) => {
        const actualName = actual.name.trim().toLowerCase();
        const expectedName = expected.name.trim().toLowerCase();
        if (actualName !== expectedName) return false;
        if (!expected.inputContains) return true;
        const inputStr = JSON.stringify(actual.input).toLowerCase();
        return Object.entries(expected.inputContains).every(([k, v]) =>
          inputStr.includes(String(v).toLowerCase())
        );
      });
      if (!found) {
        const actualNames = toolCallsActual.map(a => a.name).join(", ");
        failures.push(`Expected tool call "${expected.name}" not found. Actual calls: [${actualNames}]`);
      }
    }

    // Check expected text
    for (const expected of evalCase.expectedTextContains ?? []) {
      if (!finalText.toLowerCase().includes(expected.toLowerCase())) {
        failures.push(`Expected text "${expected}" not found in response.`);
      }
    }

    // Check forbidden text
    for (const forbidden of evalCase.expectedTextNotContains ?? []) {
      if (finalText.toLowerCase().includes(forbidden.toLowerCase())) {
        failures.push(`Forbidden text "${forbidden}" found in response.`);
      }
    }

    const score = failures.length === 0 ? 1 : Math.max(0, 1 - failures.length * 0.2);

    return {
      caseId: evalCase.id,
      passed: failures.length === 0,
      score,
      failures,
      toolCallsActual,
      finalText,
      totalInputTokens,
      totalOutputTokens,
      durationMs: Date.now() - start,
    };
  }

  async runSuite(
    suiteName: string,
    cases: EvalCase[],
    opts?: { provider: string; model: string }
  ): Promise<EvalSuiteResult> {
    const start = Date.now();
    const results: EvalResult[] = [];

    for (const c of cases) {
      const result = await this.runCase(c);
      results.push(result);
      const icon = result.passed ? "✓" : "✗";
      process.stderr.write(`  ${icon} [${c.id}] ${c.description} (${result.durationMs}ms)\n`);
    }

    const passed = results.filter((r) => r.passed).length;

    return {
      suiteName,
      runAt: new Date().toISOString(),
      provider: opts?.provider ?? "unknown",
      model: opts?.model ?? "unknown",
      totalCases: cases.length,
      passed,
      failed: cases.length - passed,
      passRate: cases.length > 0 ? passed / cases.length : 0,
      totalInputTokens: results.reduce((s, r) => s + r.totalInputTokens, 0),
      totalOutputTokens: results.reduce((s, r) => s + r.totalOutputTokens, 0),
      durationMs: Date.now() - start,
      results,
    };
  }
}
