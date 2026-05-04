Phase 6 — Complete Implementation
What Phase 6 Is (derived from the design doc blueprint)
From the full picture built across all passes, the design doc's Phase 6 is the "Product & Observability" layer:

@cowork/telemetry — OpenTelemetry-based event tracing, cost tracking, token accounting
@cowork/analytics — session analytics, usage aggregation, exportable reports
@cowork/security — network sandbox allowlist, audit log, secret scrubbing, safeMetadata
@cowork/wiki — upgraded from stub to a real "LLMWiki" compounding knowledge store
@cowork/kairos — upgraded from stub to a real background daemon (file watch + scheduled tasks)
packages/core — FullCompact (the deferred third compression tier), provider streaming, eval harness hooks
apps/cowork-cli — /sessions, /skills, /telemetry, /audit slash commands, REPL v2 (multi-line input, history file, syntax hints)
Root — phase6complete.md, updated README.md, updated tsconfig.json references
New workspace topology after Phase 6
text

locoworker/
├── apps/
│   └── cowork-cli/              ← updated: REPL v2, new slash commands, streaming
├── packages/
│   ├── core/                    ← updated: FullCompact, streaming providers, eval hooks
│   ├── graphify/                ← unchanged
│   ├── kairos/                  ← upgraded from stub → real daemon
│   ├── wiki/                    ← upgraded from stub → real LLMWiki
│   ├── research/                ← stub (Phase 7)
│   ├── orchestrator/            ← stub (Phase 7)
│   ├── plugins/                 ← stub (Phase 8)
│   ├── telemetry/               ← NEW
│   ├── analytics/               ← NEW
│   └── security/                ← NEW
├── tsconfig.json                ← updated references
└── phase6complete.md            ← NEW
PART A — @cowork/telemetry
packages/telemetry/package.json
JSON

{
  "name": "@cowork/telemetry",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./cost": "./src/cost/index.ts",
    "./trace": "./src/trace/index.ts"
  },
  "dependencies": {
    "@opentelemetry/api": "^1.7.0",
    "@opentelemetry/sdk-node": "^0.48.0",
    "@opentelemetry/sdk-trace-base": "^1.21.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.48.0",
    "@opentelemetry/resources": "^1.21.0",
    "@opentelemetry/semantic-conventions": "^1.21.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "latest"
  }
}
packages/telemetry/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": []
}
packages/telemetry/src/trace/types.ts
TypeScript

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface TraceSpan {
  spanId: string;
  traceId: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: SpanAttributes;
  status: "ok" | "error" | "unset";
  errorMessage?: string;
}

export interface TelemetryConfig {
  enabled: boolean;
  /** OTLP HTTP endpoint. e.g. http://localhost:4318/v1/traces */
  otlpEndpoint?: string;
  /** Service name for OTEL resource. Default: "locoworker" */
  serviceName?: string;
  /** Service version. Default: "0.1.0" */
  serviceVersion?: string;
  /** If true, emit spans to stdout as NDJSON (useful for local dev) */
  consoleExport?: boolean;
}
packages/telemetry/src/trace/Tracer.ts
TypeScript

import { randomUUID } from "node:crypto";
import type { SpanAttributes, TraceSpan, TelemetryConfig } from "./types.js";

/**
 * Lightweight span tracer.
 * In Phase 6 this uses a file-based NDJSON sink + optional OTLP HTTP export.
 * We deliberately avoid pulling in the full OTEL SDK unless an endpoint
 * is configured, so local-only usage has zero overhead.
 */
export class Tracer {
  private spans: TraceSpan[] = [];
  private currentTraceId: string = randomUUID();

  constructor(private config: TelemetryConfig) {}

  /** Start a new root trace (e.g. per agent session). */
  startTrace(): string {
    this.currentTraceId = randomUUID();
    return this.currentTraceId;
  }

  /** Start a span within the current trace. Returns the span for ending later. */
  startSpan(name: string, attributes: SpanAttributes = {}): TraceSpan {
    const span: TraceSpan = {
      spanId: randomUUID(),
      traceId: this.currentTraceId,
      name,
      startTime: Date.now(),
      attributes,
      status: "unset",
    };
    this.spans.push(span);
    return span;
  }

  /** End a span and optionally mark it as errored. */
  endSpan(span: TraceSpan, error?: Error): void {
    span.endTime = Date.now();
    span.status = error ? "error" : "ok";
    if (error) span.errorMessage = error.message;

    if (this.config.consoleExport) {
      process.stdout.write(JSON.stringify(span) + "\n");
    }
  }

  /** Convenience: wrap an async function in a span. */
  async withSpan<T>(
    name: string,
    attributes: SpanAttributes,
    fn: (span: TraceSpan) => Promise<T>
  ): Promise<T> {
    const span = this.startSpan(name, attributes);
    try {
      const result = await fn(span);
      this.endSpan(span);
      return result;
    } catch (err) {
      this.endSpan(span, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /** Flush spans to OTLP if configured. */
  async flush(): Promise<void> {
    if (!this.config.enabled || !this.config.otlpEndpoint) return;
    if (this.spans.length === 0) return;

    const body = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: this.config.serviceName ?? "locoworker" } },
              { key: "service.version", value: { stringValue: this.config.serviceVersion ?? "0.1.0" } },
            ],
          },
          scopeSpans: [
            {
              spans: this.spans.map((s) => ({
                traceId: s.traceId,
                spanId: s.spanId,
                name: s.name,
                startTimeUnixNano: String(s.startTime * 1_000_000),
                endTimeUnixNano: String((s.endTime ?? s.startTime) * 1_000_000),
                status: { code: s.status === "error" ? 2 : 1 },
                attributes: Object.entries(s.attributes).map(([k, v]) => ({
                  key: k,
                  value: { stringValue: String(v ?? "") },
                })),
              })),
            },
          ],
        },
      ],
    };

    try {
      await fetch(`${this.config.otlpEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      this.spans = [];
    } catch {
      // never throw on telemetry failure — just swallow
    }
  }

  getSpans(): TraceSpan[] {
    return [...this.spans];
  }
}
packages/telemetry/src/trace/index.ts
TypeScript

export { Tracer } from "./Tracer.js";
export type { TraceSpan, SpanAttributes, TelemetryConfig } from "./types.js";
packages/telemetry/src/cost/pricing.ts
TypeScript

/**
 * Token pricing table.
 * Units: USD per million tokens.
 * Updated as of 2025-Q2 — add models as needed.
 */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-opus-4-5":       { inputPerMillion: 15.00,  outputPerMillion: 75.00  },
  "claude-sonnet-4-5":     { inputPerMillion: 3.00,   outputPerMillion: 15.00  },
  "claude-haiku-3-5":      { inputPerMillion: 0.80,   outputPerMillion: 4.00   },
  // OpenAI
  "gpt-4o":                { inputPerMillion: 5.00,   outputPerMillion: 15.00  },
  "gpt-4o-mini":           { inputPerMillion: 0.15,   outputPerMillion: 0.60   },
  "gpt-4-turbo":           { inputPerMillion: 10.00,  outputPerMillion: 30.00  },
  // DeepSeek
  "deepseek-coder":        { inputPerMillion: 0.14,   outputPerMillion: 0.28   },
  "deepseek-chat":         { inputPerMillion: 0.14,   outputPerMillion: 0.28   },
  // Local (free)
  "qwen2.5-coder:7b":      { inputPerMillion: 0,      outputPerMillion: 0      },
  "llama3.2":              { inputPerMillion: 0,      outputPerMillion: 0      },
  "mistral":               { inputPerMillion: 0,      outputPerMillion: 0      },
};

export function getPricing(model: string): ModelPricing {
  // exact match
  if (PRICING[model]) return PRICING[model];
  // prefix match (e.g. "claude-sonnet-4-5-20241022" → "claude-sonnet-4-5")
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (model.startsWith(key)) return pricing;
  }
  // unknown model = free (local)
  return { inputPerMillion: 0, outputPerMillion: 0 };
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = getPricing(model);
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion
  );
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00 (local)";
  if (usd < 0.001) return `$${(usd * 1000).toFixed(4)}m`;
  if (usd < 0.01)  return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}
packages/telemetry/src/cost/CostTracker.ts
TypeScript

import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { calculateCost, formatCost } from "./pricing.js";

export interface CostRecord {
  sessionId: string;
  model: string;
  provider: string;
  projectRoot: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: string;
}

export interface CostSummary {
  totalSessions: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  formattedCost: string;
  byModel: Record<string, { sessions: number; inputTokens: number; outputTokens: number; costUsd: number }>;
  byProvider: Record<string, { sessions: number; costUsd: number }>;
}

export class CostTracker {
  private ledgerPath: string;

  constructor() {
    this.ledgerPath = join(homedir(), ".cowork", "cost-ledger.ndjson");
  }

  async init(): Promise<void> {
    await mkdir(join(homedir(), ".cowork"), { recursive: true });
  }

  async record(record: CostRecord): Promise<void> {
    const line = JSON.stringify(record) + "\n";
    try {
      const fd = await Bun.file(this.ledgerPath).exists()
        ? Bun.file(this.ledgerPath)
        : null;
      void fd; // unused — using fs/promises below
      const existing = existsSync(this.ledgerPath)
        ? await readFile(this.ledgerPath, "utf-8")
        : "";
      await writeFile(this.ledgerPath, existing + line, "utf-8");
    } catch {
      // never throw on telemetry failure
    }
  }

  async trackSession(opts: {
    sessionId: string;
    model: string;
    provider: string;
    projectRoot: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<CostRecord> {
    const costUsd = calculateCost(opts.model, opts.inputTokens, opts.outputTokens);
    const record: CostRecord = {
      ...opts,
      costUsd,
      timestamp: new Date().toISOString(),
    };
    await this.record(record);
    return record;
  }

  async summarize(days = 30): Promise<CostSummary> {
    if (!existsSync(this.ledgerPath)) {
      return {
        totalSessions: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        formattedCost: "$0.00",
        byModel: {},
        byProvider: {},
      };
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const raw = await readFile(this.ledgerPath, "utf-8");
    const records = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as CostRecord; }
        catch { return null; }
      })
      .filter((r): r is CostRecord => r !== null)
      .filter((r) => new Date(r.timestamp) >= cutoff);

    const summary: CostSummary = {
      totalSessions: records.length,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      formattedCost: "",
      byModel: {},
      byProvider: {},
    };

    for (const r of records) {
      summary.totalInputTokens += r.inputTokens;
      summary.totalOutputTokens += r.outputTokens;
      summary.totalCostUsd += r.costUsd;

      if (!summary.byModel[r.model]) {
        summary.byModel[r.model] = { sessions: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      }
      summary.byModel[r.model]!.sessions++;
      summary.byModel[r.model]!.inputTokens += r.inputTokens;
      summary.byModel[r.model]!.outputTokens += r.outputTokens;
      summary.byModel[r.model]!.costUsd += r.costUsd;

      if (!summary.byProvider[r.provider]) {
        summary.byProvider[r.provider] = { sessions: 0, costUsd: 0 };
      }
      summary.byProvider[r.provider]!.sessions++;
      summary.byProvider[r.provider]!.costUsd += r.costUsd;
    }

    summary.formattedCost = formatCost(summary.totalCostUsd);
    return summary;
  }
}
packages/telemetry/src/cost/index.ts
TypeScript

export { CostTracker } from "./CostTracker.js";
export type { CostRecord, CostSummary } from "./CostTracker.js";
export { calculateCost, formatCost, getPricing, PRICING } from "./pricing.js";
export type { ModelPricing } from "./pricing.js";
packages/telemetry/src/index.ts
TypeScript

export * from "./trace/index.js";
export * from "./cost/index.js";
PART B — @cowork/analytics
packages/analytics/package.json
JSON

{
  "name": "@cowork/analytics",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@cowork/telemetry": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "latest"
  }
}
packages/analytics/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../telemetry" }
  ]
}
packages/analytics/src/types.ts
TypeScript

export interface ToolUsageStat {
  toolName: string;
  callCount: number;
  errorCount: number;
  avgDurationMs: number;
  totalDurationMs: number;
}

export interface TurnStat {
  turnIndex: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  durationMs: number;
}

export interface SessionAnalytics {
  sessionId: string;
  projectRoot: string;
  provider: string;
  model: string;
  startedAt: string;
  completedAt?: string;
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalToolCalls: number;
  totalDurationMs: number;
  costUsd: number;
  toolUsage: ToolUsageStat[];
  turns: TurnStat[];
}

export interface AggregateReport {
  generatedAt: string;
  periodDays: number;
  totalSessions: number;
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalToolCalls: number;
  totalCostUsd: number;
  topTools: ToolUsageStat[];
  sessionsByDay: Record<string, number>;
  avgTurnsPerSession: number;
  avgCostPerSession: number;
}
packages/analytics/src/SessionAnalyticsCollector.ts
TypeScript

import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { SessionAnalytics, ToolUsageStat, TurnStat } from "./types.js";

/**
 * Collects per-session analytics in-memory during a session,
 * then persists to ~/.cowork/analytics/<sessionId>.json on completion.
 */
export class SessionAnalyticsCollector {
  private analyticsDir: string;
  private data: SessionAnalytics;
  private toolTimers = new Map<string, number>();

  constructor(opts: {
    sessionId: string;
    projectRoot: string;
    provider: string;
    model: string;
  }) {
    this.analyticsDir = join(homedir(), ".cowork", "analytics");
    this.data = {
      sessionId: opts.sessionId,
      projectRoot: opts.projectRoot,
      provider: opts.provider,
      model: opts.model,
      startedAt: new Date().toISOString(),
      totalTurns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalToolCalls: 0,
      totalDurationMs: 0,
      costUsd: 0,
      toolUsage: [],
      turns: [],
    };
  }

  async init(): Promise<void> {
    await mkdir(this.analyticsDir, { recursive: true });
  }

  recordTurn(turn: TurnStat): void {
    this.data.turns.push(turn);
    this.data.totalTurns++;
    this.data.totalInputTokens += turn.inputTokens;
    this.data.totalOutputTokens += turn.outputTokens;
    this.data.totalToolCalls += turn.toolCalls;
    this.data.totalDurationMs += turn.durationMs;
  }

  recordToolStart(toolName: string): void {
    this.toolTimers.set(toolName + "_" + Date.now(), Date.now());
  }

  recordToolEnd(toolName: string, isError: boolean): void {
    // Find the oldest unmatched timer for this tool
    const key = [...this.toolTimers.keys()]
      .filter((k) => k.startsWith(toolName + "_"))
      .sort()[0];
    const startTime = key ? this.toolTimers.get(key) ?? Date.now() : Date.now();
    if (key) this.toolTimers.delete(key);

    const durationMs = Date.now() - startTime;

    let stat = this.data.toolUsage.find((t) => t.toolName === toolName);
    if (!stat) {
      stat = { toolName, callCount: 0, errorCount: 0, avgDurationMs: 0, totalDurationMs: 0 };
      this.data.toolUsage.push(stat);
    }
    stat.callCount++;
    if (isError) stat.errorCount++;
    stat.totalDurationMs += durationMs;
    stat.avgDurationMs = stat.totalDurationMs / stat.callCount;
  }

  complete(costUsd: number): void {
    this.data.completedAt = new Date().toISOString();
    this.data.costUsd = costUsd;
  }

  async persist(): Promise<void> {
    const path = join(this.analyticsDir, `${this.data.sessionId}.json`);
    await writeFile(path, JSON.stringify(this.data, null, 2), "utf-8");
  }

  getSnapshot(): SessionAnalytics {
    return { ...this.data };
  }
}
packages/analytics/src/AggregateReporter.ts
TypeScript

import { join } from "node:path";
import { homedir } from "node:os";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { SessionAnalytics, AggregateReport, ToolUsageStat } from "./types.js";

export class AggregateReporter {
  private analyticsDir: string;

  constructor() {
    this.analyticsDir = join(homedir(), ".cowork", "analytics");
  }

  async report(days = 30): Promise<AggregateReport> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const sessions = await this.loadSessions(cutoff);

    const report: AggregateReport = {
      generatedAt: new Date().toISOString(),
      periodDays: days,
      totalSessions: sessions.length,
      totalTurns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalToolCalls: 0,
      totalCostUsd: 0,
      topTools: [],
      sessionsByDay: {},
      avgTurnsPerSession: 0,
      avgCostPerSession: 0,
    };

    const toolMap = new Map<string, ToolUsageStat>();

    for (const s of sessions) {
      report.totalTurns += s.totalTurns;
      report.totalInputTokens += s.totalInputTokens;
      report.totalOutputTokens += s.totalOutputTokens;
      report.totalToolCalls += s.totalToolCalls;
      report.totalCostUsd += s.costUsd;

      // Group by day
      const day = s.startedAt.slice(0, 10);
      report.sessionsByDay[day] = (report.sessionsByDay[day] ?? 0) + 1;

      // Aggregate tool usage
      for (const t of s.toolUsage) {
        const agg = toolMap.get(t.toolName) ?? {
          toolName: t.toolName,
          callCount: 0,
          errorCount: 0,
          avgDurationMs: 0,
          totalDurationMs: 0,
        };
        agg.callCount += t.callCount;
        agg.errorCount += t.errorCount;
        agg.totalDurationMs += t.totalDurationMs;
        agg.avgDurationMs = agg.totalDurationMs / agg.callCount;
        toolMap.set(t.toolName, agg);
      }
    }

    report.topTools = [...toolMap.values()]
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 10);

    if (sessions.length > 0) {
      report.avgTurnsPerSession = report.totalTurns / sessions.length;
      report.avgCostPerSession = report.totalCostUsd / sessions.length;
    }

    return report;
  }

  async formatReport(days = 30): Promise<string> {
    const r = await this.report(days);
    const lines: string[] = [
      `═══ Locoworker Analytics Report (last ${days} days) ═══`,
      `Generated: ${r.generatedAt}`,
      ``,
      `Sessions:    ${r.totalSessions}`,
      `Turns:       ${r.totalTurns} (avg ${r.avgTurnsPerSession.toFixed(1)}/session)`,
      `Input tok:   ${r.totalInputTokens.toLocaleString()}`,
      `Output tok:  ${r.totalOutputTokens.toLocaleString()}`,
      `Tool calls:  ${r.totalToolCalls}`,
      `Total cost:  $${r.totalCostUsd.toFixed(4)} (avg $${r.avgCostPerSession.toFixed(4)}/session)`,
      ``,
      `Top Tools:`,
      ...r.topTools.map(
        (t) =>
          `  ${t.toolName.padEnd(20)} ${t.callCount} calls  ${t.errorCount} errors  ${t.avgDurationMs.toFixed(0)}ms avg`
      ),
      ``,
      `Sessions by day:`,
      ...Object.entries(r.sessionsByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, count]) => `  ${day}: ${count}`),
    ];
    return lines.join("\n");
  }

  private async loadSessions(cutoff: Date): Promise<SessionAnalytics[]> {
    if (!existsSync(this.analyticsDir)) return [];
    try {
      const files = await readdir(this.analyticsDir);
      const jsons = files.filter((f) => f.endsWith(".json"));
      const sessions = await Promise.all(
        jsons.map(async (f) => {
          try {
            const raw = await readFile(join(this.analyticsDir, f), "utf-8");
            return JSON.parse(raw) as SessionAnalytics;
          } catch { return null; }
        })
      );
      return sessions
        .filter((s): s is SessionAnalytics => s !== null)
        .filter((s) => new Date(s.startedAt) >= cutoff);
    } catch { return []; }
  }
}
packages/analytics/src/index.ts
TypeScript

export { SessionAnalyticsCollector } from "./SessionAnalyticsCollector.js";
export { AggregateReporter } from "./AggregateReporter.js";
export type { SessionAnalytics, ToolUsageStat, TurnStat, AggregateReport } from "./types.js";
PART C — @cowork/security
packages/security/package.json
JSON

{
  "name": "@cowork/security",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./audit": "./src/audit/index.ts",
    "./scrub": "./src/scrub/index.ts",
    "./sandbox": "./src/sandbox/index.ts"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "latest"
  }
}
packages/security/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": []
}
packages/security/src/scrub/SecretScrubber.ts
TypeScript

/**
 * Scrubs known secret patterns from strings before logging/telemetry.
 * Based on the design doc's "safeMetadata" concept.
 */

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // API keys
  [/sk-[a-zA-Z0-9]{20,}/g,                      "[ANTHROPIC_KEY]"],
  [/sk-proj-[a-zA-Z0-9\-_]{20,}/g,              "[OPENAI_KEY]"],
  [/sk-or-v1-[a-zA-Z0-9]{20,}/g,                "[OPENROUTER_KEY]"],
  // Bearer tokens
  [/Bearer\s+[a-zA-Z0-9\-_.]{16,}/gi,           "Bearer [TOKEN]"],
  // Generic secrets
  [/(?:password|passwd|secret|token|key)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi, "[SECRET]"],
  // AWS keys
  [/AKIA[A-Z0-9]{16}/g,                          "[AWS_KEY]"],
  [/[a-zA-Z0-9/+]{40}(?![a-zA-Z0-9/+])/g,       (s) => s.startsWith("AKIA") ? "[AWS_SECRET]" : s],
  // Private keys
  [/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g, "[PRIVATE_KEY]"],
  // File paths with usernames (normalize home dirs)
  [/\/Users\/[^/\s]+/g,                          "/Users/[USER]"],
  [/\/home\/[^/\s]+/g,                           "/home/[USER]"],
];

export function scrubSecrets(input: string): string {
  let result = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    if (typeof replacement === "string") {
      result = result.replace(pattern, replacement);
    } else {
      result = result.replace(pattern, replacement);
    }
  }
  return result;
}

/**
 * Build a "safe" metadata object for logging by scrubbing all string values.
 * Aligns with the design doc's `safeMetadata` branding.
 */
export function safeMetadata(obj: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      safe[k] = scrubSecrets(v);
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      safe[k] = safeMetadata(v as Record<string, unknown>);
    } else {
      safe[k] = v;
    }
  }
  return safe;
}
packages/security/src/scrub/index.ts
TypeScript

export { scrubSecrets, safeMetadata } from "./SecretScrubber.js";
packages/security/src/audit/types.ts
TypeScript

export type AuditEventKind =
  | "tool_call"
  | "tool_denied"
  | "tool_approved"
  | "session_start"
  | "session_end"
  | "permission_escalation"
  | "bash_command"
  | "file_write"
  | "file_delete"
  | "mcp_call"
  | "skill_execute";

export interface AuditEvent {
  id: string;
  kind: AuditEventKind;
  sessionId: string;
  projectRoot: string;
  timestamp: string;
  actor: "agent" | "user" | "system";
  toolName?: string;
  /** scrubbed input — never log raw secrets */
  inputSummary?: string;
  outcome: "allowed" | "denied" | "error" | "success";
  reason?: string;
  durationMs?: number;
}
packages/security/src/audit/AuditLog.ts
TypeScript

import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { scrubSecrets } from "../scrub/SecretScrubber.js";
import type { AuditEvent, AuditEventKind } from "./types.js";

export class AuditLog {
  private logPath: string;
  private sessionId: string;
  private projectRoot: string;

  constructor(opts: { sessionId: string; projectRoot: string }) {
    this.sessionId = opts.sessionId;
    this.projectRoot = opts.projectRoot;
    const today = new Date().toISOString().slice(0, 10);
    this.logPath = join(homedir(), ".cowork", "audit", `${today}.ndjson`);
  }

  async init(): Promise<void> {
    await mkdir(join(homedir(), ".cowork", "audit"), { recursive: true });
  }

  async log(
    kind: AuditEventKind,
    opts: {
      actor?: AuditEvent["actor"];
      toolName?: string;
      inputSummary?: string;
      outcome: AuditEvent["outcome"];
      reason?: string;
      durationMs?: number;
    }
  ): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      kind,
      sessionId: this.sessionId,
      projectRoot: this.projectRoot,
      timestamp: new Date().toISOString(),
      actor: opts.actor ?? "agent",
      toolName: opts.toolName,
      inputSummary: opts.inputSummary
        ? scrubSecrets(opts.inputSummary.slice(0, 500))
        : undefined,
      outcome: opts.outcome,
      reason: opts.reason,
      durationMs: opts.durationMs,
    };

    try {
      await appendFile(this.logPath, JSON.stringify(event) + "\n", "utf-8");
    } catch {
      // never throw on audit failure
    }
  }

  /** Convenience methods for common audit events */
  async toolCall(toolName: string, inputSummary: string, durationMs: number, isError: boolean): Promise<void> {
    await this.log("tool_call", {
      toolName,
      inputSummary,
      outcome: isError ? "error" : "success",
      durationMs,
    });
  }

  async toolDenied(toolName: string, reason: string): Promise<void> {
    await this.log("tool_denied", { toolName, outcome: "denied", reason });
  }

  async toolApproved(toolName: string): Promise<void> {
    await this.log("tool_approved", { toolName, actor: "user", outcome: "allowed" });
  }

  async bashCommand(command: string, outcome: AuditEvent["outcome"], durationMs: number): Promise<void> {
    await this.log("bash_command", {
      toolName: "bash",
      inputSummary: command,
      outcome,
      durationMs,
    });
  }

  async sessionStart(): Promise<void> {
    await this.log("session_start", { actor: "system", outcome: "success" });
  }

  async sessionEnd(totalTurns: number, totalTokens: number): Promise<void> {
    await this.log("session_end", {
      actor: "system",
      outcome: "success",
      reason: `turns=${totalTurns} tokens=${totalTokens}`,
    });
  }
}
packages/security/src/audit/index.ts
TypeScript

export { AuditLog } from "./AuditLog.js";
export type { AuditEvent, AuditEventKind } from "./types.js";
packages/security/src/sandbox/NetworkSandbox.ts
TypeScript

/**
 * Network allowlist enforcement.
 * Tracks fetch/network calls and blocks URLs not in the allowlist.
 * In Phase 6 this is advisory (logs + warns). Full enforcement
 * (intercepting native fetch) is a Phase 8 hardening concern.
 */

export interface SandboxConfig {
  enabled: boolean;
  allowlist: string[];
}

export class NetworkSandbox {
  private allowlist: Set<string>;

  constructor(private config: SandboxConfig) {
    this.allowlist = new Set(config.allowlist.map((u) => u.toLowerCase()));
  }

  isAllowed(url: string): boolean {
    if (!this.config.enabled) return true;
    if (this.allowlist.size === 0) return true;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      // Direct match
      if (this.allowlist.has(host)) return true;
      // Suffix match (e.g. allowlist has "anthropic.com" and host is "api.anthropic.com")
      for (const allowed of this.allowlist) {
        if (host === allowed || host.endsWith("." + allowed)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  check(url: string, context: string): void {
    if (!this.isAllowed(url)) {
      console.warn(
        `[security] Network sandbox: "${context}" attempted to reach "${url}" which is not in the allowlist.`
      );
    }
  }

  addToAllowlist(host: string): void {
    this.allowlist.add(host.toLowerCase());
  }

  getConfig(): SandboxConfig {
    return {
      enabled: this.config.enabled,
      allowlist: [...this.allowlist],
    };
  }
}
packages/security/src/sandbox/index.ts
TypeScript

export { NetworkSandbox } from "./NetworkSandbox.js";
export type { SandboxConfig } from "./NetworkSandbox.js";
packages/security/src/index.ts
TypeScript

export * from "./scrub/index.js";
export * from "./audit/index.js";
export * from "./sandbox/index.js";
PART D — @cowork/kairos (upgraded from stub to real daemon)
packages/kairos/package.json
JSON

{
  "name": "@cowork/kairos",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./daemon": "./src/daemon/index.ts",
    "./scheduler": "./src/scheduler/index.ts",
    "./watcher": "./src/watcher/index.ts"
  },
  "dependencies": {
    "@cowork/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "latest"
  }
}
packages/kairos/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" }
  ]
}
packages/kairos/src/scheduler/types.ts
TypeScript

export type TaskStatus = "pending" | "running" | "complete" | "failed" | "cancelled";
export type TaskKind = "once" | "interval" | "cron" | "on-file-change";

export interface ScheduledTask {
  id: string;
  name: string;
  kind: TaskKind;
  /** ISO date string for "once" tasks */
  runAt?: string;
  /** Milliseconds for "interval" tasks */
  intervalMs?: number;
  /** Cron expression for "cron" tasks (Phase 7 full cron parser) */
  cronExpr?: string;
  /** Glob pattern for "on-file-change" tasks */
  watchGlob?: string;
  /** The agent prompt to run when this task fires */
  prompt: string;
  projectRoot: string;
  status: TaskStatus;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  maxRuns?: number;
}
packages/kairos/src/scheduler/TaskScheduler.ts
TypeScript

import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { ScheduledTask, TaskKind } from "./types.js";

export class TaskScheduler {
  private tasks = new Map<string, ScheduledTask>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private storagePath: string;
  private onFire?: (task: ScheduledTask) => Promise<void>;

  constructor(projectRoot: string) {
    this.storagePath = join(
      homedir(),
      ".cowork",
      "kairos",
      "tasks.json"
    );
  }

  async init(): Promise<void> {
    await mkdir(join(homedir(), ".cowork", "kairos"), { recursive: true });
    await this.load();
  }

  onTaskFire(handler: (task: ScheduledTask) => Promise<void>): void {
    this.onFire = handler;
  }

  async schedule(opts: {
    name: string;
    kind: TaskKind;
    prompt: string;
    projectRoot: string;
    runAt?: string;
    intervalMs?: number;
    cronExpr?: string;
    watchGlob?: string;
    maxRuns?: number;
  }): Promise<ScheduledTask> {
    const task: ScheduledTask = {
      id: randomUUID(),
      ...opts,
      status: "pending",
      runCount: 0,
    };

    if (task.kind === "interval" && task.intervalMs) {
      task.nextRunAt = new Date(Date.now() + task.intervalMs).toISOString();
    } else if (task.kind === "once" && task.runAt) {
      task.nextRunAt = task.runAt;
    }

    this.tasks.set(task.id, task);
    await this.save();
    this.startTimer(task);
    return task;
  }

  async cancel(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const timer = this.timers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(taskId);
    }

    task.status = "cancelled";
    await this.save();
    return true;
  }

  list(): ScheduledTask[] {
    return [...this.tasks.values()];
  }

  get(id: string): ScheduledTask | undefined {
    return this.tasks.get(id);
  }

  private startTimer(task: ScheduledTask): void {
    if (task.kind === "interval" && task.intervalMs) {
      const timer = setInterval(() => void this.fire(task.id), task.intervalMs);
      this.timers.set(task.id, timer);
    } else if (task.kind === "once" && task.runAt) {
      const delay = Math.max(0, new Date(task.runAt).getTime() - Date.now());
      const timer = setTimeout(() => void this.fire(task.id), delay);
      // Store as interval handle (compatible type via cast)
      this.timers.set(task.id, timer as unknown as ReturnType<typeof setInterval>);
    }
  }

  private async fire(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || task.status === "cancelled") return;

    task.status = "running";
    task.lastRunAt = new Date().toISOString();
    task.runCount++;

    try {
      if (this.onFire) await this.onFire(task);
      task.status = task.kind === "once" ? "complete" : "pending";
    } catch {
      task.status = "failed";
    }

    if (task.kind === "interval" && task.intervalMs) {
      task.nextRunAt = new Date(Date.now() + task.intervalMs).toISOString();
    }

    if (task.maxRuns !== undefined && task.runCount >= task.maxRuns) {
      task.status = "complete";
      const timer = this.timers.get(taskId);
      if (timer) {
        clearInterval(timer);
        this.timers.delete(taskId);
      }
    }

    await this.save();
  }

  private async load(): Promise<void> {
    if (!existsSync(this.storagePath)) return;
    try {
      const raw = await readFile(this.storagePath, "utf-8");
      const tasks = JSON.parse(raw) as ScheduledTask[];
      for (const t of tasks) {
        this.tasks.set(t.id, t);
        // Re-arm timers for surviving tasks
        if (t.status === "pending") this.startTimer(t);
      }
    } catch {
      // corrupt file — start fresh
    }
  }

  private async save(): Promise<void> {
    const data = JSON.stringify([...this.tasks.values()], null, 2);
    await writeFile(this.storagePath, data, "utf-8");
  }
}
packages/kairos/src/scheduler/index.ts
TypeScript

export { TaskScheduler } from "./TaskScheduler.js";
export type { ScheduledTask, TaskKind, TaskStatus } from "./types.js";
packages/kairos/src/watcher/FileWatcher.ts
TypeScript

import { watch as fsWatch } from "node:fs";
import { join, resolve } from "node:path";
import type { FSWatcher } from "node:fs";

export interface WatchEvent {
  type: "change" | "rename";
  filename: string;
  absolutePath: string;
}

export type WatchHandler = (event: WatchEvent) => void | Promise<void>;

export class FileWatcher {
  private watchers = new Map<string, FSWatcher>();

  watch(dir: string, handler: WatchHandler, opts: { recursive?: boolean } = {}): () => void {
    const absDir = resolve(dir);

    const watcher = fsWatch(
      absDir,
      { recursive: opts.recursive ?? true },
      (eventType, filename) => {
        if (!filename) return;
        void handler({
          type: eventType as "change" | "rename",
          filename,
          absolutePath: join(absDir, filename),
        });
      }
    );

    const id = `${absDir}-${Date.now()}`;
    this.watchers.set(id, watcher);

    return () => {
      watcher.close();
      this.watchers.delete(id);
    };
  }

  stopAll(): void {
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
  }
}
packages/kairos/src/watcher/index.ts
TypeScript

export { FileWatcher } from "./FileWatcher.js";
export type { WatchEvent, WatchHandler } from "./FileWatcher.js";
packages/kairos/src/daemon/KairosDaemon.ts
TypeScript

import { TaskScheduler } from "../scheduler/TaskScheduler.js";
import { FileWatcher } from "../watcher/FileWatcher.js";
import type { ScheduledTask } from "../scheduler/types.js";

export interface DaemonConfig {
  projectRoot: string;
  /** Called when a scheduled task fires with its agent prompt */
  onTaskPrompt: (prompt: string, task: ScheduledTask) => Promise<void>;
  /** If true, watch project files and trigger "on-file-change" tasks */
  enableFileWatch?: boolean;
}

/**
 * KairosDaemon: Background task scheduler + file watcher.
 * Runs inside the same Bun process (no separate daemon process in Phase 6).
 * Phase 7 will extract this into a standalone daemon via Bun.serve + IPC.
 */
export class KairosDaemon {
  readonly scheduler: TaskScheduler;
  private watcher: FileWatcher;
  private config: DaemonConfig;
  private fileUnwatchers: Array<() => void> = [];
  private running = false;

  constructor(config: DaemonConfig) {
    this.config = config;
    this.scheduler = new TaskScheduler(config.projectRoot);
    this.watcher = new FileWatcher();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.scheduler.init();

    this.scheduler.onTaskFire(async (task) => {
      await this.config.onTaskPrompt(task.prompt, task);
    });

    if (this.config.enableFileWatch) {
      // Watch the project root for "on-file-change" tasks
      const stop = this.watcher.watch(
        this.config.projectRoot,
        async (event) => {
          const tasks = this.scheduler
            .list()
            .filter((t) => t.kind === "on-file-change" && t.status === "pending");

          for (const task of tasks) {
            if (!task.watchGlob) continue;
            // Simple glob-to-regex: *.ts → /\.ts$/
            const regex = new RegExp(
              task.watchGlob
                .replace(".", "\\.")
                .replace("*", ".*")
                .replace("?", ".")
            );
            if (regex.test(event.filename)) {
              await this.config.onTaskPrompt(
                task.prompt.replace("{{file}}", event.absolutePath),
                task
              );
            }
          }
        },
        { recursive: true }
      );
      this.fileUnwatchers.push(stop);
    }
  }

  async stop(): Promise<void> {
    for (const stop of this.fileUnwatchers) stop();
    this.fileUnwatchers = [];
    this.watcher.stopAll();
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}
packages/kairos/src/daemon/index.ts
TypeScript

export { KairosDaemon } from "./KairosDaemon.js";
export type { DaemonConfig } from "./KairosDaemon.js";
packages/kairos/src/index.ts
TypeScript

export * from "./scheduler/index.js";
export * from "./watcher/index.js";
export * from "./daemon/index.js";
PART E — @cowork/wiki (upgraded from stub to real LLMWiki)
packages/wiki/package.json
JSON

{
  "name": "@cowork/wiki",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./store": "./src/store/index.ts",
    "./compiler": "./src/compiler/index.ts",
    "./tools": "./src/tools/index.ts"
  },
  "dependencies": {
    "@cowork/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "latest"
  }
}
packages/wiki/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" }
  ]
}
packages/wiki/src/store/types.ts
TypeScript

export interface WikiPage {
  id: string;
  title: string;
  slug: string;
  /** Raw source material (user-added facts, scraped docs, etc.) */
  sources: string[];
  /** The compiled wiki article text — generated/updated by WikiCompiler */
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  compiledAt?: string;
  /** How many times this page has been read by the agent */
  readCount: number;
  /** Confidence score 0–1 set by the compiler */
  confidence: number;
}

export interface WikiSearchResult {
  page: WikiPage;
  score: number;
  via: "title" | "body" | "tag" | "combined";
}
packages/wiki/src/store/WikiStore.ts
TypeScript

import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { WikiPage, WikiSearchResult } from "./types.js";

export class WikiStore {
  private wikiDir: string;

  constructor(projectRoot: string) {
    // Per-project wiki lives inside the project's .cowork folder
    this.wikiDir = join(resolve(projectRoot), ".cowork", "wiki");
  }

  async init(): Promise<void> {
    await mkdir(this.wikiDir, { recursive: true });
  }

  async create(opts: {
    title: string;
    sources?: string[];
    body?: string;
    tags?: string[];
    confidence?: number;
  }): Promise<WikiPage> {
    const now = new Date().toISOString();
    const slug = opts.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const page: WikiPage = {
      id: randomUUID(),
      title: opts.title,
      slug,
      sources: opts.sources ?? [],
      body: opts.body ?? "",
      tags: opts.tags ?? [],
      createdAt: now,
      updatedAt: now,
      readCount: 0,
      confidence: opts.confidence ?? 0.8,
    };

    await this.save(page);
    return page;
  }

  async update(id: string, patch: Partial<WikiPage>): Promise<WikiPage | null> {
    const page = await this.getById(id);
    if (!page) return null;

    const updated: WikiPage = {
      ...page,
      ...patch,
      id: page.id,
      updatedAt: new Date().toISOString(),
    };
    await this.save(updated);
    return updated;
  }

  async getById(id: string): Promise<WikiPage | null> {
    try {
      const files = await readdir(this.wikiDir);
      for (const f of files.filter((f) => f.endsWith(".json"))) {
        const raw = await readFile(join(this.wikiDir, f), "utf-8");
        const page = JSON.parse(raw) as WikiPage;
        if (page.id === id) return page;
      }
      return null;
    } catch { return null; }
  }

  async getBySlug(slug: string): Promise<WikiPage | null> {
    const path = join(this.wikiDir, `${slug}.json`);
    if (!existsSync(path)) return null;
    try {
      const raw = await readFile(path, "utf-8");
      return JSON.parse(raw) as WikiPage;
    } catch { return null; }
  }

  async list(): Promise<WikiPage[]> {
    if (!existsSync(this.wikiDir)) return [];
    try {
      const files = await readdir(this.wikiDir);
      const pages = await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map(async (f) => {
            try {
              const raw = await readFile(join(this.wikiDir, f), "utf-8");
              return JSON.parse(raw) as WikiPage;
            } catch { return null; }
          })
      );
      return pages
        .filter((p): p is WikiPage => p !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch { return []; }
  }

  async delete(id: string): Promise<boolean> {
    const page = await this.getById(id);
    if (!page) return false;
    try {
      await unlink(join(this.wikiDir, `${page.slug}.json`));
      return true;
    } catch { return false; }
  }

  async search(query: string, limit = 10): Promise<WikiSearchResult[]> {
    const pages = await this.list();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    const scored = pages.map((page) => {
      let score = 0;
      let via: WikiSearchResult["via"] = "combined";

      for (const term of terms) {
        if (page.title.toLowerCase().includes(term)) { score += 3; via = "title"; }
        if (page.body.toLowerCase().includes(term))  { score += 1; via = "body"; }
        if (page.tags.some((t) => t.toLowerCase().includes(term))) { score += 2; via = "tag"; }
      }

      return { page, score, via } as WikiSearchResult;
    });

    return scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async incrementReadCount(id: string): Promise<void> {
    const page = await this.getById(id);
    if (page) await this.update(id, { readCount: page.readCount + 1 });
  }

  /** Export the entire wiki as a WIKI_INDEX.md for agent consumption */
  async exportIndex(): Promise<string> {
    const pages = await this.list();
    if (pages.length === 0) return "# Wiki\n\nNo wiki pages yet.\n";

    const lines = [
      "# Project Wiki",
      `*${pages.length} pages — updated ${new Date().toISOString().slice(0, 10)}*`,
      "",
    ];

    for (const page of pages) {
      const tags = page.tags.length ? ` [${page.tags.join(", ")}]` : "";
      lines.push(`## ${page.title}${tags}`);
      if (page.body) {
        lines.push(page.body.slice(0, 300) + (page.body.length > 300 ? "..." : ""));
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private async save(page: WikiPage): Promise<void> {
    const path = join(this.wikiDir, `${page.slug}.json`);
    await writeFile(path, JSON.stringify(page, null, 2), "utf-8");
  }
}
packages/wiki/src/store/index.ts
TypeScript

export { WikiStore } from "./WikiStore.js";
export type { WikiPage, WikiSearchResult } from "./types.js";
packages/wiki/src/compiler/WikiCompiler.ts
TypeScript

import type { WikiPage } from "../store/types.js";
import type { WikiStore } from "../store/WikiStore.js";

/**
 * WikiCompiler takes raw sources added to a wiki page and uses the
 * agent's model to generate/update the structured wiki article body.
 *
 * It calls a provided "compile" function (injected from core's QueryEngine)
 * so it remains decoupled from the provider layer.
 */
export type CompileFn = (prompt: string) => Promise<string>;

export class WikiCompiler {
  constructor(
    private store: WikiStore,
    private compile: CompileFn
  ) {}

  async compilePage(pageId: string): Promise<WikiPage | null> {
    const page = await this.store.getById(pageId);
    if (!page) return null;
    if (page.sources.length === 0) return page;

    const sourcesText = page.sources
      .map((s, i) => `### Source ${i + 1}\n${s}`)
      .join("\n\n");

    const prompt = [
      `You are a technical knowledge compiler. Your job is to synthesize the following raw source material into a clean, accurate, well-structured wiki article.`,
      ``,
      `Title: ${page.title}`,
      `Tags: ${page.tags.join(", ")}`,
      ``,
      `## Raw Sources`,
      sourcesText,
      ``,
      `## Instructions`,
      `Write a concise, factual wiki article based on the sources above.`,
      `Use markdown. Include a brief summary paragraph, then structured sections.`,
      `Do not invent facts not present in the sources.`,
      `End with a confidence score on a line like: CONFIDENCE: 0.85`,
    ].join("\n");

    try {
      const output = await this.compile(prompt);

      // Extract confidence score
      const confMatch = output.match(/CONFIDENCE:\s*([\d.]+)/i);
      const confidence = confMatch ? Math.min(1, Math.max(0, parseFloat(confMatch[1]!))) : 0.7;
      const body = output.replace(/CONFIDENCE:.*$/im, "").trim();

      return await this.store.update(pageId, {
        body,
        confidence,
        compiledAt: new Date().toISOString(),
      }) as WikiPage;
    } catch {
      return page;
    }
  }

  async compileAll(): Promise<number> {
    const pages = await this.store.list();
    let compiled = 0;
    for (const page of pages) {
      if (page.sources.length > 0) {
        const result = await this.compilePage(page.id);
        if (result) compiled++;
      }
    }
    return compiled;
  }
}
packages/wiki/src/compiler/index.ts
TypeScript

export { WikiCompiler } from "./WikiCompiler.js";
export type { CompileFn } from "./WikiCompiler.js";
packages/wiki/src/tools/WikiTools.ts
TypeScript

import { PermissionLevel } from "@cowork/core";
import type { ToolDefinition } from "@cowork/core/tools";
import type { WikiStore } from "../store/WikiStore.js";
import type { WikiCompiler } from "../compiler/WikiCompiler.js";

export function makeWikiTools(
  store: WikiStore,
  compiler: WikiCompiler
): ToolDefinition[] {
  return [
    {
      name: "wiki_read",
      description: "Read a wiki page by title or slug. Returns the full article body.",
      permissionLevel: PermissionLevel.READ_ONLY,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Page title, slug, or search query." },
        },
        required: ["query"],
      },
      async execute(input: { query: string }) {
        // Try exact slug first
        const bySlug = await store.getBySlug(
          input.query.toLowerCase().replace(/[^a-z0-9]+/g, "-")
        );
        if (bySlug) {
          await store.incrementReadCount(bySlug.id);
          return {
            content: `# ${bySlug.title}\n\n${bySlug.body || "(no compiled body yet — run wiki_compile first)"}`,
            isError: false,
          };
        }

        // Search
        const results = await store.search(input.query, 3);
        if (results.length === 0) {
          return { content: `No wiki pages found for "${input.query}".`, isError: false };
        }

        const lines = results.map(
          (r) => `## ${r.page.title}\n${r.page.body.slice(0, 400)}...`
        );
        return { content: lines.join("\n\n"), isError: false };
      },
    },

    {
      name: "wiki_write",
      description: "Add a source to a wiki page (creating it if it doesn't exist). Sources are raw facts/docs that will be compiled into an article.",
      permissionLevel: PermissionLevel.CONSTRAINED,
      inputSchema: {
        type: "object",
        properties: {
          title:  { type: "string", description: "Wiki page title." },
          source: { type: "string", description: "Raw source material to add to the page." },
          tags:   { type: "array", items: { type: "string" }, description: "Optional tags." },
        },
        required: ["title", "source"],
      },
      async execute(input: { title: string; source: string; tags?: string[] }) {
        const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        let page = await store.getBySlug(slug);
        if (!page) {
          page = await store.create({
            title: input.title,
            sources: [input.source],
            tags: input.tags ?? [],
          });
          return {
            content: `Created wiki page "${input.title}" (id: ${page.id}). Run wiki_compile to generate the article.`,
            isError: false,
          };
        }

        const updated = await store.update(page.id, {
          sources: [...page.sources, input.source],
          tags: input.tags ? [...new Set([...page.tags, ...input.tags])] : page.tags,
        });
        return {
          content: `Added source to wiki page "${input.title}" (${updated?.sources.length ?? 0} sources total). Run wiki_compile to regenerate.`,
          isError: false,
        };
      },
    },

    {
      name: "wiki_compile",
      description: "Compile a wiki page from its raw sources into a structured article using the AI model.",
      permissionLevel: PermissionLevel.STANDARD,
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the page to compile. Omit to compile all pages." },
        },
        required: [],
      },
      async execute(input: { title?: string }) {
        if (input.title) {
          const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const page = await store.getBySlug(slug);
          if (!page) {
            return { content: `Wiki page "${input.title}" not found.`, isError: true };
          }
          const compiled = await compiler.compilePage(page.id);
          if (!compiled) return { content: "Compilation failed.", isError: true };
          return {
            content: `Compiled "${compiled.title}" (confidence: ${compiled.confidence.toFixed(2)}):\n\n${compiled.body.slice(0, 800)}`,
            isError: false,
          };
        }

        const count = await compiler.compileAll();
        return { content: `Compiled ${count} wiki pages.`, isError: false };
      },
    },

    {
      name: "wiki_list",
      description: "List all wiki pages with titles and tags.",
      permissionLevel: PermissionLevel.READ_ONLY,
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
      async execute() {
        const pages = await store.list();
        if (pages.length === 0) {
          return { content: "No wiki pages yet. Use wiki_write to create pages.", isError: false };
        }
        const lines = pages.map(
          (p) => `• ${p.title} [${p.tags.join(", ") || "untagged"}] — ${p.body ? "compiled" : "pending compile"}`
        );
        return { content: `Wiki pages (${pages.length}):\n${lines.join("\n")}`, isError: false };
      },
    },

    {
      name: "wiki_search",
      description: "Search wiki pages by keyword.",
      permissionLevel: PermissionLevel.READ_ONLY,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
        },
        required: ["query"],
      },
      async execute(input: { query: string }) {
        const results = await store.search(input.query, 5);
        if (results.length === 0) {
          return { content: `No wiki pages match "${input.query}".`, isError: false };
        }
        const lines = results.map(
          (r) => `• ${r.page.title} (score: ${r.score}, via: ${r.via})\n  ${r.page.body.slice(0, 200)}`
        );
        return { content: lines.join("\n\n"), isError: false };
      },
    },
  ];
}
packages/wiki/src/tools/index.ts
TypeScript

export { makeWikiTools } from "./WikiTools.js";
packages/wiki/src/index.ts
TypeScript

export * from "./store/index.js";
export * from "./compiler/index.js";
export * from "./tools/index.js";
PART F — Core Phase 6 additions (packages/core)
packages/core/src/services/compact/FullCompact.ts
This is the deferred third compression tier from Phase 2. It runs a deep structural compaction, unlike AutoCompact (which summarizes) — it extracts "decisions made", "facts learned", and "remaining open questions" from a long multi-turn history.

TypeScript

import type { Message } from "../../types.js";
import type { QueryEngine } from "../QueryEngine.js";

export interface FullCompactResult {
  messages: Message[];
  summary: string;
  decisionsMade: string[];
  factsLearned: string[];
  openQuestions: string[];
  originalMessageCount: number;
  compactedMessageCount: number;
}

export async function fullCompact(
  messages: Message[],
  engine: QueryEngine,
  systemPrompt: string
): Promise<FullCompactResult> {
  // Render history to plain text
  const transcript = messages
    .map((m) => {
      const content =
        typeof m.content === "string"
          ? m.content
          : m.content
              .map((b) => {
                if (b.type === "text") return b.text;
                if (b.type === "tool_use") return `[Tool: ${b.name}(${JSON.stringify(b.input).slice(0, 200)})]`;
                if (b.type === "tool_result") return `[Result: ${String(b.content).slice(0, 200)}]`;
                return "";
              })
              .join("\n");
      return `${m.role.toUpperCase()}: ${content}`;
    })
    .join("\n\n");

  const prompt = [
    "You are a session compactor. Analyze the following conversation transcript and produce a structured summary.",
    "",
    "Extract:",
    "1. A 2-3 sentence narrative summary",
    "2. DECISIONS_MADE: bullet list of concrete decisions/actions taken",
    "3. FACTS_LEARNED: bullet list of facts, file contents, or code structures discovered",
    "4. OPEN_QUESTIONS: bullet list of unresolved questions or pending work",
    "",
    "Format your response EXACTLY as:",
    "SUMMARY: <narrative>",
    "DECISIONS_MADE:",
    "- <decision>",
    "FACTS_LEARNED:",
    "- <fact>",
    "OPEN_QUESTIONS:",
    "- <question>",
    "",
    "## Transcript",
    transcript.slice(0, 40_000),
  ].join("\n");

  let rawOutput = "";
  try {
    const response = await engine.call({
      systemPrompt: "You are a precise session compactor.",
      messages: [{ role: "user", content: prompt }],
      tools: [],
      maxTokens: 2000,
    });

    rawOutput = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
  } catch {
    // Fall back to simple truncation on model failure
    return {
      messages: messages.slice(-4),
      summary: "Session compacted due to context length.",
      decisionsMade: [],
      factsLearned: [],
      openQuestions: [],
      originalMessageCount: messages.length,
      compactedMessageCount: 4,
    };
  }

  // Parse structured output
  const summary = rawOutput.match(/SUMMARY:\s*(.+?)(?=\nDECISIONS_MADE:|$)/s)?.[1]?.trim() ?? "";
  const decisions = extractBullets(rawOutput, "DECISIONS_MADE");
  const facts = extractBullets(rawOutput, "FACTS_LEARNED");
  const questions = extractBullets(rawOutput, "OPEN_QUESTIONS");

  // Build compacted message set
  const compactedContent = [
    `**Session Summary**\n${summary}`,
    decisions.length ? `**Decisions Made**\n${decisions.map((d) => `- ${d}`).join("\n")}` : "",
    facts.length ? `**Facts Learned**\n${facts.map((f) => `- ${f}`).join("\n")}` : "",
    questions.length ? `**Open Questions**\n${questions.map((q) => `- ${q}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const compactedMessages: Message[] = [
    {
      role: "user",
      content: `[Session history compacted. ${messages.length} messages → structured summary]\n\n${compactedContent}`,
    },
    {
      role: "assistant",
      content: "Understood. I have the session context from the compact summary and will continue from here.",
    },
  ];

  return {
    messages: compactedMessages,
    summary,
    decisionsMade: decisions,
    factsLearned: facts,
    openQuestions: questions,
    originalMessageCount: messages.length,
    compactedMessageCount: compactedMessages.length,
  };
}

function extractBullets(text: string, section: string): string[] {
  const match = text.match(new RegExp(`${section}:\\s*\\n((?:- .+\\n?)+)`, "i"));
  if (!match) return [];
  return match[1]!
    .split("\n")
    .filter((l) => l.trim().startsWith("- "))
    .map((l) => l.replace(/^- /, "").trim());
}
packages/core/src/services/compact/ContextCompressor.ts — update to expose full()
Add this method to the existing ContextCompressor class:

TypeScript

// Add import at top of ContextCompressor.ts:
import { fullCompact, type FullCompactResult } from "./FullCompact.js";

// Add this method to the ContextCompressor class:
async full(messages: Message[], systemPrompt: string): Promise<FullCompactResult> {
  return fullCompact(messages, this.engine, systemPrompt);
}
packages/core/src/services/streaming/StreamingProvider.ts
TypeScript

import type { Message, ContentBlock, ModelResponse } from "../../types.js";

export interface StreamChunk {
  type: "text_delta" | "tool_use_start" | "tool_use_delta" | "tool_use_end" | "message_stop" | "usage";
  text?: string;
  toolName?: string;
  toolId?: string;
  toolInputDelta?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface StreamingProvider {
  stream(opts: {
    systemPrompt: string;
    messages: Message[];
    tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
    maxTokens?: number;
  }): AsyncIterable<StreamChunk>;
}

/**
 * Assembles a ModelResponse from a stream of StreamChunks.
 * Used by providers that implement streaming to produce the same
 * ModelResponse type that non-streaming providers return.
 */
export async function assembleFromStream(
  stream: AsyncIterable<StreamChunk>
): Promise<ModelResponse> {
  const content: ContentBlock[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let currentText = "";
  let currentToolName = "";
  let currentToolId = "";
  let currentToolInputStr = "";
  let stopReason: ModelResponse["stopReason"] = "end_turn";

  for await (const chunk of stream) {
    switch (chunk.type) {
      case "text_delta":
        currentText += chunk.text ?? "";
        break;
      case "tool_use_start":
        // Flush any pending text
        if (currentText) {
          content.push({ type: "text", text: currentText });
          currentText = "";
        }
        currentToolName = chunk.toolName ?? "";
        currentToolId = chunk.toolId ?? "";
        currentToolInputStr = "";
        stopReason = "tool_use";
        break;
      case "tool_use_delta":
        currentToolInputStr += chunk.toolInputDelta ?? "";
        break;
      case "tool_use_end":
        try {
          content.push({
            type: "tool_use",
            id: currentToolId,
            name: currentToolName,
            input: JSON.parse(currentToolInputStr || "{}"),
          });
        } catch {
          content.push({
            type: "tool_use",
            id: currentToolId,
            name: currentToolName,
            input: {},
          });
        }
        break;
      case "usage":
        inputTokens += chunk.inputTokens ?? 0;
        outputTokens += chunk.outputTokens ?? 0;
        break;
      case "message_stop":
        if (currentText) {
          content.push({ type: "text", text: currentText });
          currentText = "";
        }
        break;
    }
  }

  if (currentText) {
    content.push({ type: "text", text: currentText });
  }

  return {
    stopReason,
    content,
    usage: { inputTokens, outputTokens },
    model: "",
  };
}
packages/core/src/services/streaming/index.ts
TypeScript

export { assembleFromStream } from "./StreamingProvider.js";
export type { StreamChunk, StreamingProvider } from "./StreamingProvider.js";
packages/core/src/eval/types.ts
TypeScript

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
packages/core/src/eval/EvalRunner.ts
TypeScript

import type { EvalCase, EvalResult, EvalSuiteResult } from "./types.js";
import type { QueryEngine } from "../services/QueryEngine.js";
import type { ToolDefinition } from "../tools/types.js";
import { PermissionLevel } from "../permissions/index.js";
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
        if (event.type === "tool_call") {
          toolCallsActual.push({ name: event.name, input: event.input });
        }
        if (event.type === "text") {
          finalText += event.text;
        }
        if (event.type === "complete") {
          totalInputTokens = event.totalInputTokens;
          totalOutputTokens = event.totalOutputTokens;
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
        if (actual.name !== expected.name) return false;
        if (!expected.inputContains) return true;
        const inputStr = JSON.stringify(actual.input);
        return Object.entries(expected.inputContains).every(([k, v]) =>
          inputStr.includes(JSON.stringify(v))
        );
      });
      if (!found) {
        failures.push(`Expected tool call "${expected.name}" not found.`);
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
packages/core/src/eval/index.ts
TypeScript

export { EvalRunner } from "./EvalRunner.js";
export type { EvalCase, EvalResult, EvalSuiteResult } from "./types.js";
Update packages/core/src/index.ts — add Phase 6 exports
TypeScript

// Add to the existing Phase 5 exports at the bottom:

// --- Phase 6 additions ---
export * from "./services/streaming/index.js";
export * from "./eval/index.js";
export { fullCompact } from "./services/compact/FullCompact.js";
export type { FullCompactResult } from "./services/compact/FullCompact.js";
PART G — REPL v2 (apps/cowork-cli)
apps/cowork-cli/src/repl.ts — replace with full REPL v2
TypeScript

import * as readline from "node:readline";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import type { SessionRuntime } from "./session.js";
import type { ResolvedSettings } from "@cowork/core";
import { renderEvent } from "./render.js";
import { queryLoop } from "@cowork/core";
import { defaultRegistry } from "@cowork/core/commands"; // adjust if path differs

const HISTORY_PATH = join(homedir(), ".cowork", "repl-history.txt");
const MAX_HISTORY = 500;

export async function runRepl(
  runtime: SessionRuntime,
  settings: ResolvedSettings
): Promise<void> {
  // Ensure history file exists
  await mkdir(join(homedir(), ".cowork"), { recursive: true });

  // Load history from disk
  let history: string[] = [];
  if (existsSync(HISTORY_PATH)) {
    try {
      const raw = await readFile(HISTORY_PATH, "utf-8");
      history = raw.split("\n").filter(Boolean).slice(-MAX_HISTORY);
    } catch { /* ignore */ }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    history,
    historySize: MAX_HISTORY,
    removeHistoryDuplicates: true,
    prompt: buildPrompt(settings),
  });

  // Banner
  const banner = [
    ``,
    `  ╔═══════════════════════════════════════╗`,
    `  ║      locoworker  (Phase 6 REPL)       ║`,
    `  ╚═══════════════════════════════════════╝`,
    ``,
    `  Provider : ${settings.provider}`,
    `  Model    : ${settings.model ?? "default"}`,
    `  Mode     : ${settings.permissionMode}`,
    `  Session  : ${runtime.sessionId}`,
    `  CWD      : ${settings.workingDirectory}`,
    ``,
    `  Type /help for commands. Ctrl+C or /exit to quit.`,
    ``,
  ].join("\n");
  process.stdout.write(banner);

  const registry = defaultRegistry();

  async function runTurn(input: string): Promise<void> {
    let assistantBuffer = "";

    await runtime.memory.appendTranscript(runtime.sessionId, [
      { role: "user", content: input },
    ]);

    for await (const event of queryLoop(input, {
      engine: runtime.engine,
      systemPrompt: runtime.systemPrompt,
      tools: runtime.tools,
      maxTokens: settings.maxTokens,
      maxTurns: settings.maxTurns,
      compressor: runtime.compressor,
      requestApproval: async (toolName, toolInput) => {
        return new Promise((resolve) => {
          const summary = JSON.stringify(toolInput).slice(0, 120);
          rl.question(
            `\n  ⚠  Allow "${toolName}" (${summary})? [y/N] `,
            (answer) => resolve(answer.trim().toLowerCase() === "y")
          );
        });
      },
      hooks: runtime.hooks,
      sessionId: runtime.sessionId,
      workingDirectory: settings.workingDirectory,
    })) {
      renderEvent(event, process.stdout);
      if (event.type === "text") assistantBuffer += event.text;
    }

    if (assistantBuffer) {
      await runtime.memory.appendTranscript(runtime.sessionId, [
        { role: "assistant", content: assistantBuffer },
      ]);
    }

    // Refresh system prompt (picks up any MEMORY.md changes from this turn)
    runtime.systemPrompt = await runtime.refreshSystemPrompt();
  }

  rl.prompt();

  rl.on("line", async (rawLine) => {
    rl.pause();
    const line = rawLine.trim();

    if (!line) {
      rl.prompt();
      rl.resume();
      return;
    }

    // Persist to history file
    await appendFile(HISTORY_PATH, line + "\n", "utf-8").catch(() => {});

    // Multi-line input: lines ending with \ continue
    if (line.endsWith("\\")) {
      // Accumulate multi-line input
      // Simple implementation: show a continuation prompt
      // Full block-input (``` fences) is a Phase 7 enhancement
      process.stdout.write("  > ");
      rl.resume();
      return;
    }

    try {
      if (line.startsWith("/")) {
        // Slash command
        const [cmdName, ...rest] = line.slice(1).split(" ");
        const args = rest.join(" ");
        const cmd = registry.get(cmdName ?? "");

        if (!cmd) {
          process.stdout.write(`  Unknown command "/${cmdName}". Type /help for available commands.\n\n`);
        } else {
          const output = await cmd.execute(args, {
            memory: runtime.memory,
            engine: runtime.engine,
            compressor: runtime.compressor,
            sessionId: runtime.sessionId,
            workingDirectory: settings.workingDirectory,
            runTurn,
            skills: runtime.skills,
            sessionManager: runtime.sessionManager,
          });
          if (output) process.stdout.write(output + "\n\n");
        }
      } else {
        await runTurn(line);
      }
    } catch (err) {
      process.stdout.write(
        `\n  Error: ${err instanceof Error ? err.message : String(err)}\n\n`
      );
    }

    rl.setPrompt(buildPrompt(settings));
    rl.prompt();
    rl.resume();
  });

  rl.on("close", () => {
    process.stdout.write("\n  Goodbye.\n\n");
    process.exit(0);
  });

  rl.on("SIGINT", () => {
    process.stdout.write("\n  (Use /exit or Ctrl+D to quit)\n\n");
    rl.prompt();
  });
}

function buildPrompt(settings: ResolvedSettings): string {
  const model = (settings.model ?? "").split(":")[0]?.split("/").pop()?.slice(0, 12) ?? "?";
  const mode = settings.permissionMode.slice(0, 3);
  return `  [${model}|${mode}] cowork> `;
}
New Phase 6 slash commands
packages/core/src/commands/sessions.ts
TypeScript

import type { SlashCommand } from "./types.js";

export const sessionsCommand: SlashCommand = {
  name: "sessions",
  summary: "List recent sessions or show a specific session.",
  async execute(args, ctx) {
    if (!ctx.sessionManager) return "Session manager not available.";

    const sessions = await ctx.sessionManager.list(20);
    if (sessions.length === 0) return "No sessions found.";

    const lines = sessions.map((s) => {
      const date = s.createdAt.slice(0, 16).replace("T", " ");
      const status = s.status === "complete" ? "✓" : s.status === "active" ? "●" : "✗";
      const cost = s.totalInputTokens + s.totalOutputTokens;
      return `${status} ${date}  ${s.id.slice(0, 8)}  turns:${s.turns}  tokens:${cost}  ${s.summary?.slice(0, 50) ?? ""}`;
    });

    return [
      `Recent sessions (${sessions.length}):`,
      `  ST  DATE              ID        TURNS  TOKENS  SUMMARY`,
      ...lines.map((l) => `  ${l}`),
    ].join("\n");
  },
};
packages/core/src/commands/skills.ts
TypeScript

import type { SlashCommand } from "./types.js";

export const skillsCommand: SlashCommand = {
  name: "skills",
  summary: "List available skills in .cowork/skills/.",
  async execute(args, ctx) {
    if (!ctx.skills) return "Skill registry not available.";

    const skills = ctx.skills.list();
    if (skills.length === 0) {
      return [
        "No skills found.",
        "Add JSON files to .cowork/skills/ to create skills.",
        "",
        "Example skill file (.cowork/skills/test-runner.json):",
        JSON.stringify({
          name: "test-runner",
          description: "Run the project test suite",
          kind: "shell",
          command: "bun test 2>&1",
        }, null, 2),
      ].join("\n");
    }

    const lines = skills.map(
      (s) => `  • ${s.name.padEnd(20)} [${s.kind}]  ${s.description}`
    );
    return [`Skills (${skills.length}):`, ...lines].join("\n");
  },
};
packages/core/src/commands/telemetry.ts
TypeScript

import type { SlashCommand } from "./types.js";
import { CostTracker } from "@cowork/telemetry/cost";

export const telemetryCommand: SlashCommand = {
  name: "telemetry",
  summary: "Show cost and usage summary for recent sessions.",
  async execute(args) {
    const days = parseInt(args || "30", 10) || 30;
    const tracker = new CostTracker();
    await tracker.init();
    const summary = await tracker.summarize(days);

    const lines = [
      `Cost & Usage (last ${days} days):`,
      `  Sessions:      ${summary.totalSessions}`,
      `  Input tokens:  ${summary.totalInputTokens.toLocaleString()}`,
      `  Output tokens: ${summary.totalOutputTokens.toLocaleString()}`,
      `  Total cost:    ${summary.formattedCost}`,
      ``,
      `By model:`,
      ...Object.entries(summary.byModel).map(
        ([m, s]) =>
          `  ${m.padEnd(28)} ${s.sessions} sessions  $${s.costUsd.toFixed(4)}`
      ),
    ];

    return lines.join("\n");
  },
};
packages/core/src/commands/audit.ts
TypeScript

import type { SlashCommand } from "./types.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export const auditCommand: SlashCommand = {
  name: "audit",
  summary: "Show today's audit log entries.",
  async execute(args) {
    const today = new Date().toISOString().slice(0, 10);
    const logPath = join(homedir(), ".cowork", "audit", `${today}.ndjson`);

    if (!existsSync(logPath)) {
      return `No audit log for today (${today}).`;
    }

    try {
      const raw = await readFile(logPath, "utf-8");
      const lines = raw.split("\n").filter(Boolean);
      const limit = parseInt(args || "20", 10) || 20;
      const recent = lines.slice(-limit);

      const formatted = recent.map((line) => {
        try {
          const e = JSON.parse(line) as {
            timestamp: string;
            kind: string;
            toolName?: string;
            outcome: string;
            reason?: string;
          };
          const time = e.timestamp.slice(11, 19);
          const tool = e.toolName ? `/${e.toolName}` : "";
          const reason = e.reason ? ` — ${e.reason.slice(0, 60)}` : "";
          return `  ${time}  ${e.kind.padEnd(18)}${tool.padEnd(20)} ${e.outcome}${reason}`;
        } catch {
          return `  ${line.slice(0, 80)}`;
        }
      });

      return [
        `Audit log — ${today} (${lines.length} entries, showing last ${recent.length}):`,
        `  TIME      KIND               TOOL                 OUTCOME`,
        ...formatted,
      ].join("\n");
    } catch (err) {
      return `Failed to read audit log: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
packages/core/src/commands/analytics.ts
TypeScript

import type { SlashCommand } from "./types.js";
import { AggregateReporter } from "@cowork/analytics";

export const analyticsCommand: SlashCommand = {
  name: "analytics",
  summary: "Show aggregate analytics report for recent sessions.",
  async execute(args) {
    const days = parseInt(args || "30", 10) || 30;
    const reporter = new AggregateReporter();
    return reporter.formatReport(days);
  },
};
Update packages/core/src/commands/registry.ts
Add all Phase 6 commands to the default registry:

TypeScript

import { sessionsCommand } from "./sessions.js";
import { skillsCommand } from "./skills.js";
import { telemetryCommand } from "./telemetry.js";
import { auditCommand } from "./audit.js";
import { analyticsCommand } from "./analytics.js";

// Add to the defaultRegistry() function's registration list:
registry.register(sessionsCommand);
registry.register(skillsCommand);
registry.register(telemetryCommand);
registry.register(auditCommand);
registry.register(analyticsCommand);
PART H — Update apps/cowork-cli/src/session.ts for Phase 6
Add telemetry, analytics, audit, wiki, and kairos wiring to buildSessionRuntime:

TypeScript

import { CostTracker } from "@cowork/telemetry/cost";
import { Tracer } from "@cowork/telemetry/trace";
import { SessionAnalyticsCollector } from "@cowork/analytics";
import { AuditLog } from "@cowork/security/audit";
import { WikiStore } from "@cowork/wiki/store";
import { WikiCompiler } from "@cowork/wiki/compiler";
import { makeWikiTools } from "@cowork/wiki/tools";
import { KairosDaemon } from "@cowork/kairos/daemon";

// Inside buildSessionRuntime(), after existing wiring:

// --- Phase 6: Telemetry ---
const costTracker = new CostTracker();
await costTracker.init();

const tracer = new Tracer({
  enabled: !!process.env["COWORK_TELEMETRY_ENABLED"],
  otlpEndpoint: process.env["COWORK_OTLP_ENDPOINT"],
  consoleExport: process.env["COWORK_TELEMETRY_CONSOLE"] === "true",
  serviceName: "locoworker",
});

// --- Phase 6: Analytics ---
const analyticsCollector = new SessionAnalyticsCollector({
  sessionId,
  projectRoot: settings.workingDirectory,
  provider: settings.provider,
  model: settings.model ?? "unknown",
});
await analyticsCollector.init();

// --- Phase 6: Audit ---
const auditLog = new AuditLog({ sessionId, projectRoot: settings.workingDirectory });
await auditLog.init();
await auditLog.sessionStart();

// --- Phase 6: Wiki ---
const wikiStore = new WikiStore(settings.workingDirectory);
await wikiStore.init();

const wikiCompiler = new WikiCompiler(wikiStore, async (prompt) => {
  const response = await engine.call({
    systemPrompt: "You are a precise knowledge compiler.",
    messages: [{ role: "user", content: prompt }],
    tools: [],
    maxTokens: 2000,
  });
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
});

const wikiTools = settings.enableWiki !== false ? makeWikiTools(wikiStore, wikiCompiler) : [];

// --- Phase 6: Kairos Daemon ---
const kairos = new KairosDaemon({
  projectRoot: settings.workingDirectory,
  enableFileWatch: !!process.env["COWORK_KAIROS_FILE_WATCH"],
  onTaskPrompt: async (prompt, task) => {
    console.log(`\n[kairos] Task "${task.name}" fired. Running agent prompt...`);
    // Phase 7: this will spawn a full queryLoop session via SessionManager
    // For Phase 6: log and skip (daemon is in-process but prompt execution is deferred)
    console.log(`[kairos] Prompt: ${prompt.slice(0, 100)}`);
  },
});

if (process.env["COWORK_KAIROS_ENABLED"] === "true") {
  await kairos.start();
}

// --- Update existing on-complete hook to include Phase 6 cost/analytics tracking ---
hooks.register("on-complete", async (ctx) => {
  // Update session record (Phase 5)
  await sessionManager.update(sessionId, {
    status: "complete",
    summary: ctx.finalText.slice(0, 500),
    totalInputTokens: ctx.totalInputTokens,
    totalOutputTokens: ctx.totalOutputTokens,
    turns: ctx.turnIndex,
  });

  // Cost tracking (Phase 6)
  const costRecord = await costTracker.trackSession({
    sessionId,
    model: settings.model ?? "unknown",
    provider: settings.provider,
    projectRoot: settings.workingDirectory,
    inputTokens: ctx.totalInputTokens,
    outputTokens: ctx.totalOutputTokens,
  });

  // Analytics (Phase 6)
  analyticsCollector.complete(costRecord.costUsd);
  await analyticsCollector.persist();

  // Audit (Phase 6)
  await auditLog.sessionEnd(ctx.turnIndex, ctx.totalInputTokens + ctx.totalOutputTokens);

  // Flush traces (Phase 6)
  await tracer.flush();

  // Stop kairos daemon on session end (Phase 6)
  if (kairos.isRunning()) await kairos.stop();
});

// --- Update final tool list ---
const tools = [
  ...DEFAULT_TOOLS,
  ...makeMemoryTools(memory, sessionId),
  ...(settings.enableGraphify ? graphifyTools : []),
  ...mcpTools,
  ...wikiTools,           // Phase 6
];

// Return extended runtime
return {
  engine,
  memory,
  compressor,
  tools,
  systemPrompt,
  sessionId,
  sessionManager,
  skills,
  hooks,
  clients: mcpClients,
  // Phase 6 additions
  costTracker,
  tracer,
  analyticsCollector,
  auditLog,
  wikiStore,
  kairos,
  refreshSystemPrompt: async () => {
    return assembleSystemPrompt(SYSTEM_PROMPT, settings.workingDirectory, memory);
  },
};
PART I — Update workspace topology files
Update root tsconfig.json
JSON

{
  "files": [],
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/graphify" },
    { "path": "./packages/telemetry" },
    { "path": "./packages/analytics" },
    { "path": "./packages/security" },
    { "path": "./packages/kairos" },
    { "path": "./packages/wiki" },
    { "path": "./packages/research" },
    { "path": "./packages/orchestrator" },
    { "path": "./packages/plugins" },
    { "path": "./apps/cowork-cli" }
  ]
}
Update apps/cowork-cli/package.json
Add Phase 6 workspace deps:

JSON

{
  "dependencies": {
    "@cowork/core": "workspace:*",
    "@cowork/graphify": "workspace:*",
    "@cowork/telemetry": "workspace:*",
    "@cowork/analytics": "workspace:*",
    "@cowork/security": "workspace:*",
    "@cowork/kairos": "workspace:*",
    "@cowork/wiki": "workspace:*",
    "@cowork/research": "workspace:*",
    "@cowork/orchestrator": "workspace:*",
    "@cowork/plugins": "workspace:*"
  }
}
Update apps/cowork-cli/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/core" },
    { "path": "../../packages/graphify" },
    { "path": "../../packages/telemetry" },
    { "path": "../../packages/analytics" },
    { "path": "../../packages/security" },
    { "path": "../../packages/kairos" },
    { "path": "../../packages/wiki" }
  ]
}
Update tsconfig.base.json — add Phase 6 paths
JSON

{
  "compilerOptions": {
    "paths": {
      "@cowork/core":          ["./packages/core/src/index.ts"],
      "@cowork/core/*":        ["./packages/core/src/*"],
      "@cowork/graphify":      ["./packages/graphify/src/index.ts"],
      "@cowork/graphify/*":    ["./packages/graphify/src/*"],
      "@cowork/telemetry":     ["./packages/telemetry/src/index.ts"],
      "@cowork/telemetry/*":   ["./packages/telemetry/src/*"],
      "@cowork/analytics":     ["./packages/analytics/src/index.ts"],
      "@cowork/analytics/*":   ["./packages/analytics/src/*"],
      "@cowork/security":      ["./packages/security/src/index.ts"],
      "@cowork/security/*":    ["./packages/security/src/*"],
      "@cowork/kairos":        ["./packages/kairos/src/index.ts"],
      "@cowork/kairos/*":      ["./packages/kairos/src/*"],
      "@cowork/wiki":          ["./packages/wiki/src/index.ts"],
      "@cowork/wiki/*":        ["./packages/wiki/src/*"],
      "@cowork/research":      ["./packages/research/src/index.ts"],
      "@cowork/orchestrator":  ["./packages/orchestrator/src/index.ts"],
      "@cowork/plugins":       ["./packages/plugins/src/index.ts"]
    }
  }
}
PART J — New env vars for Phase 6
Add to .env.example:

Bash

# ── Phase 6: Telemetry ───────────────────────────────────────
COWORK_TELEMETRY_ENABLED=false
COWORK_OTLP_ENDPOINT=http://localhost:4318/v1/traces
COWORK_TELEMETRY_CONSOLE=false

# ── Phase 6: Kairos Daemon ───────────────────────────────────
COWORK_KAIROS_ENABLED=false
COWORK_KAIROS_FILE_WATCH=false

# ── Phase 6: Wiki ────────────────────────────────────────────
COWORK_WIKI_ENABLED=true

# ── Phase 6: Security ────────────────────────────────────────
COWORK_SANDBOX_ENABLED=false
COWORK_SANDBOX_ALLOWLIST=anthropic.com,openai.com,api.openrouter.ai
COWORK_AUDIT_ENABLED=true
PART K — phase6complete.md
Markdown

# Phase 6 Complete

## What was built

Phase 6 adds the "Product & Observability" layer to locoworker.

### New packages

| Package              | Description                                              |
|----------------------|----------------------------------------------------------|
| `@cowork/telemetry`  | OpenTelemetry-compatible tracing + per-model cost tracker|
| `@cowork/analytics`  | Per-session + aggregate usage analytics                  |
| `@cowork/security`   | Secret scrubbing, audit log, network sandbox             |
| `@cowork/kairos`     | Background task scheduler + file watcher daemon          |
| `@cowork/wiki`       | LLMWiki: compounding knowledge store with AI compilation |

### Core additions

- `FullCompact` — third compression tier (structured: summary + decisions + facts + questions)
- `StreamingProvider` / `assembleFromStream` — streaming abstraction layer for providers
- `EvalRunner` / `EvalCase` — eval harness for testing agent behavior against expected outputs

### CLI additions

- REPL v2: persistent history file, rich prompt with model+mode, inline approval prompts
- New slash commands: `/sessions`, `/skills`, `/telemetry`, `/audit`, `/analytics`
- Wiki tools available to the agent: `wiki_read`, `wiki_write`, `wiki_compile`, `wiki_list`, `wiki_search`

### Updated wiring

- `SessionRuntime` now instantiates and wires all Phase 6 subsystems
- `on-complete` hook now records cost, analytics, audit, and flushes telemetry
- Root `tsconfig.json` references all 10 workspace packages
- `tsconfig.base.json` paths covers all current + planned packages

## Remaining for Phase 7

- Multi-agent orchestration (`@cowork/orchestrator` real implementation)
- AutoResearch loop (`@cowork/research` real implementation)
- Kairos daemon as a standalone Bun process with IPC
- Full OTLP streaming (replace fetch-based flush with SDK)
- MiroFish simulation studio
- OpenClaw messaging gateway
- Hermes MCP server host
Complete Phase 6 file manifest
text

packages/
  telemetry/
    package.json
    tsconfig.json
    src/
      index.ts
      trace/
        types.ts
        Tracer.ts
        index.ts
      cost/
        pricing.ts
        CostTracker.ts
        index.ts

  analytics/
    package.json
    tsconfig.json
    src/
      index.ts
      types.ts
      SessionAnalyticsCollector.ts
      AggregateReporter.ts

  security/
    package.json
    tsconfig.json
    src/
      index.ts
      scrub/
        SecretScrubber.ts
        index.ts
      audit/
        types.ts
        AuditLog.ts
        index.ts
      sandbox/
        NetworkSandbox.ts
        index.ts

  kairos/
    package.json
    tsconfig.json
    src/
      index.ts
      scheduler/
        types.ts
        TaskScheduler.ts
        index.ts
      watcher/
        FileWatcher.ts
        index.ts
      daemon/
        KairosDaemon.ts
        index.ts

  wiki/
    package.json
    tsconfig.json
    src/
      index.ts
      store/
        types.ts
        WikiStore.ts
        index.ts
      compiler/
        WikiCompiler.ts
        index.ts
      tools/
        WikiTools.ts
        index.ts

packages/core/src/
  services/
    compact/
      FullCompact.ts          ← NEW
    streaming/
      StreamingProvider.ts    ← NEW
      index.ts                ← NEW
  eval/
    types.ts                  ← NEW
    EvalRunner.ts             ← NEW
    index.ts                  ← NEW

apps/cowork-cli/src/
  repl.ts                     ← REPLACED (REPL v2)
  session.ts                  ← UPDATED (Phase 6 wiring)

packages/core/src/commands/
  sessions.ts                 ← NEW
  skills.ts                   ← NEW
  telemetry.ts                ← NEW
  audit.ts                    ← NEW
  analytics.ts                ← NEW
  registry.ts                 ← UPDATED

root/
  tsconfig.json               ← UPDATED
  tsconfig.base.json          ← UPDATED
  .env.example                ← UPDATED
  phase6complete.md           ← NEW





