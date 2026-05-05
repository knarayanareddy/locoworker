export interface EvalCase {
  id: string;
  description: string;
  /** The user prompt to run */
  prompt: string;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Expected tool calls (partial match) */
  expectedToolCalls?: Array<{ name: string; inputContains?: Record<string, unknown> }>;
  /** Expected text in the final response */
  expectedTextContains?: string[];
  /** Text that must NOT appear in the final response */
  expectedTextNotContains?: string[];
  /** Max turns before failing */
  maxTurns?: number;
}

export interface EvalResult {
  caseId: string;
  passed: boolean;
  score: number; // 0–1
  failures: string[];
  toolCallsActual: Array<{ name: string; input: unknown }>;
  finalText: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
}

export interface EvalSuiteResult {
  suiteName: string;
  runAt: string;
  provider: string;
  model: string;
  totalCases: number;
  passed: number;
  failed: number;
  passRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
  results: EvalResult[];
}
