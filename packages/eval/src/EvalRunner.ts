import type {
  EvalCase,
  EvalSuite,
  EvalOutput,
  EvalResult,
  SuiteResult,
  AssertionResult,
  Assertion,
} from "./types";
import { queryLoop, resolveSettings, DEFAULT_TOOLS, type AgentEvent } from "@cowork/core";
import { estimateCost } from "@cowork/analytics";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export class EvalRunner {
  private suite: EvalSuite;

  constructor(suite: EvalSuite) {
    this.suite = suite;
  }

  async run(
    onCaseComplete?: (result: EvalResult) => void
  ): Promise<SuiteResult> {
    const startMs = Date.now();
    const results: EvalResult[] = [];
    const concurrency = this.suite.maxConcurrency ?? 1;

    // Process cases with concurrency limit
    for (let i = 0; i < this.suite.cases.length; i += concurrency) {
      const batch = this.suite.cases.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((c) => this.runCase(c))
      );
      for (const r of batchResults) {
        results.push(r);
        onCaseComplete?.(r);
      }
    }

    const passed = results.filter((r) => r.passed).length;
    return {
      suiteName: this.suite.name,
      totalCases: results.length,
      passed,
      failed: results.length - passed,
      passRate: results.length > 0 ? passed / results.length : 0,
      totalDurationMs: Date.now() - startMs,
      results,
      runAt: new Date().toISOString(),
    };
  }

  private async runCase(evalCase: EvalCase): Promise<EvalResult> {
    const startMs = Date.now();

    // Create isolated temp workspace
    const tmpDir = path.join(tmpdir(), `cowork-eval-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });

    // Write context files to temp dir
    if (evalCase.contextFiles) {
      for (const [filename, content] of Object.entries(evalCase.contextFiles)) {
        const filePath = path.join(tmpDir, filename);
        await mkdir(path.dirname(filePath), { recursive: true });
        await Bun.write(filePath, content);
      }
    }

    let output: EvalOutput;

    try {
      output = await this.executeCase(evalCase, tmpDir);
    } catch (err) {
      output = {
        caseId: evalCase.id,
        prompt: evalCase.prompt,
        fullText: "",
        toolsCalled: [],
        events: [],
        turns: 0,
        estimatedCostUsd: 0,
        durationMs: Date.now() - startMs,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      // Cleanup temp dir (best effort)
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }

    const assertionResults = await this.checkAssertions(evalCase.assertions, output);
    const passed = assertionResults.every((a) => a.passed);

    return {
      caseId: evalCase.id,
      description: evalCase.description,
      passed,
      durationMs: Date.now() - startMs,
      assertionResults,
      output,
    };
  }

  private async executeCase(evalCase: EvalCase, workingDir: string): Promise<EvalOutput> {
    const settings = await resolveSettings(workingDir, process.env, {
      provider: this.suite.provider ?? "ollama",
      model: this.suite.model ?? "qwen2.5-coder:7b",
    });

    const events: AgentEvent[] = [];
    let fullText = "";
    const toolsCalled: string[] = [];
    let turns = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    const timeout = evalCase.timeout ?? 120_000;
    const timeoutPromise = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("Eval case timed out")), timeout)
    );

    const runPromise = (async () => {
      for await (const event of queryLoop(evalCase.prompt, {
        settings,
        systemPrompt: evalCase.systemPromptOverride ?? "You are a helpful AI assistant.",
        tools: DEFAULT_TOOLS,
        projectRoot: workingDir,
        history: [],
      })) {
        events.push(event as AgentEvent);
        if (event.type === "text") fullText += event.text ?? "";
        if (event.type === "tool_call") toolsCalled.push((event as any).toolName);
        if (event.type === "turn_start") turns++;
        if (event.type === "complete") {
          inputTokens += (event as any).usage?.inputTokens ?? 0;
          outputTokens += (event as any).usage?.outputTokens ?? 0;
        }
      }
    })();

    await Promise.race([runPromise, timeoutPromise]);

    return {
      caseId: evalCase.id,
      prompt: evalCase.prompt,
      fullText,
      toolsCalled,
      events,
      turns,
      estimatedCostUsd: estimateCost(
        settings.model,
        inputTokens,
        outputTokens
      ),
      durationMs: 0, // filled by caller
    };
  }

  private async checkAssertions(
    assertions: Assertion[],
    output: EvalOutput
  ): Promise<AssertionResult[]> {
    const results: AssertionResult[] = [];

    for (const assertion of assertions) {
      const result = await this.checkAssertion(assertion, output);
      results.push(result);
    }

    return results;
  }

  private async checkAssertion(
    assertion: Assertion,
    output: EvalOutput
  ): Promise<AssertionResult> {
    const text = output.fullText;

    switch (assertion.type) {
      case "contains":
        return {
          assertion,
          passed: text.includes(String(assertion.value ?? "")),
          reason: `Output ${text.includes(String(assertion.value)) ? "contains" : "does not contain"} "${assertion.value}"`,
        };

      case "not_contains":
        return {
          assertion,
          passed: !text.includes(String(assertion.value ?? "")),
          reason: `Output ${!text.includes(String(assertion.value)) ? "does not contain" : "contains"} "${assertion.value}"`,
        };

      case "starts_with":
        return {
          assertion,
          passed: text.trimStart().startsWith(String(assertion.value ?? "")),
        };

      case "ends_with":
        return {
          assertion,
          passed: text.trimEnd().endsWith(String(assertion.value ?? "")),
        };

      case "regex": {
        const re =
          assertion.value instanceof RegExp
            ? assertion.value
            : new RegExp(String(assertion.value ?? ""));
        return { assertion, passed: re.test(text) };
      }

      case "json_valid":
        try {
          JSON.parse(text);
          return { assertion, passed: true };
        } catch {
          return { assertion, passed: false, reason: "Output is not valid JSON" };
        }

      case "tool_called":
        return {
          assertion,
          passed: output.toolsCalled.includes(String(assertion.value ?? "")),
          reason: `Tool "${assertion.value}" ${output.toolsCalled.includes(String(assertion.value)) ? "was" : "was NOT"} called`,
        };

      case "tool_not_called":
        return {
          assertion,
          passed: !output.toolsCalled.includes(String(assertion.value ?? "")),
        };

      case "no_error":
        return {
          assertion,
          passed: !output.error && !output.events.some((e: any) => e.type === "error"),
        };

      case "turns_lte":
        return {
          assertion,
          passed: output.turns <= Number(assertion.value ?? Infinity),
          reason: `Used ${output.turns} turns (limit: ${assertion.value})`,
        };

      case "cost_lte":
        return {
          assertion,
          passed: output.estimatedCostUsd <= Number(assertion.value ?? Infinity),
          reason: `Cost $${output.estimatedCostUsd.toFixed(5)} (limit: $${assertion.value})`,
        };

      case "llm_judge":
        return this.llmJudge(assertion, output);

      case "custom":
        if (assertion.customFn) {
          try {
            const passed = assertion.customFn(output);
            return { assertion, passed };
          } catch (err) {
            return {
              assertion,
              passed: false,
              reason: `Custom assertion error: ${err instanceof Error ? err.message : String(err)}`,
            };
          }
        }
        return { assertion, passed: false, reason: "No customFn provided" };

      default:
        return { assertion, passed: false, reason: `Unknown assertion type: ${assertion.type}` };
    }
  }

  private async llmJudge(
    assertion: Assertion,
    output: EvalOutput
  ): Promise<AssertionResult> {
    try {
      const { QueryEngine, resolveProvider } = await import("@cowork/core");
      const provider = resolveProvider({
        provider: this.suite.provider ?? "ollama",
        model: this.suite.model ?? "qwen2.5-coder:7b",
      });
      const engine = new QueryEngine(provider);

      const response = await engine.call({
        systemPrompt: [
          "You are an objective AI evaluator.",
          "Rate the quality of an AI response from 0.0 to 1.0.",
          "Return ONLY a JSON object: {\"score\":0.0-1.0,\"reason\":\"brief explanation\"}",
        ].join(" "),
        messages: [
          {
            role: "user",
            content: [
              `Evaluation criteria: ${assertion.judgePrompt ?? "Is this a good response?"}`,
              `Original prompt: ${output.prompt}`,
              `AI response: ${output.fullText.slice(0, 2000)}`,
              "Rate from 0.0 to 1.0.",
            ].join("\n\n"),
          },
        ],
        tools: [],
        maxTokens: 256,
      });

      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");

      const match = text.match(/\{[\s\S]*?\}/);
      if (!match) throw new Error("No JSON in judge response");

      const { score, reason } = JSON.parse(match[0]);
      const threshold = assertion.threshold ?? 0.7;
      return {
        assertion,
        passed: score >= threshold,
        reason: `Judge score: ${score} (threshold: ${threshold}) — ${reason}`,
      };
    } catch (err) {
      return {
        assertion,
        passed: false,
        reason: `LLM judge failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
