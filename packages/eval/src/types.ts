export type AssertionType =
  | "contains"          // output contains string
  | "not_contains"      // output does NOT contain string
  | "starts_with"       // output starts with string
  | "ends_with"         // output ends with string
  | "regex"             // output matches regex
  | "json_valid"        // output is valid JSON
  | "tool_called"       // specific tool was called during the run
  | "tool_not_called"   // specific tool was NOT called
  | "no_error"          // agent loop produced no error events
  | "turns_lte"         // total turns <= N
  | "cost_lte"          // estimated cost <= N USD
  | "llm_judge"         // use an LLM to judge quality (slow but flexible)
  | "custom";           // custom function

export interface Assertion {
  type: AssertionType;
  value?: string | number | RegExp;
  judgePrompt?: string;    // for llm_judge: what to evaluate
  threshold?: number;      // for llm_judge: 0–1 pass threshold
  customFn?: (output: EvalOutput) => boolean;
}

export interface EvalCase {
  id: string;
  description: string;
  prompt: string;
  systemPromptOverride?: string;
  contextFiles?: Record<string, string>;  // filename -> content (written to temp dir)
  assertions: Assertion[];
  tags?: string[];
  timeout?: number;       // ms, default 120_000
}

export interface EvalSuite {
  name: string;
  description?: string;
  cases: EvalCase[];
  provider?: string;
  model?: string;
  maxConcurrency?: number;   // default 1 (serial)
}

export interface EvalOutput {
  caseId: string;
  prompt: string;
  fullText: string;
  toolsCalled: string[];
  events: unknown[];
  turns: number;
  estimatedCostUsd: number;
  durationMs: number;
  error?: string;
}

export type AssertionResult = {
  assertion: Assertion;
  passed: boolean;
  reason?: string;
};

export interface EvalResult {
  caseId: string;
  description: string;
  passed: boolean;
  durationMs: number;
  assertionResults: AssertionResult[];
  output: EvalOutput;
}

export interface SuiteResult {
  suiteName: string;
  totalCases: number;
  passed: number;
  failed: number;
  passRate: number;
  totalDurationMs: number;
  results: EvalResult[];
  runAt: string;
}
