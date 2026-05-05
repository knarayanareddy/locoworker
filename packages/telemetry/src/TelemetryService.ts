import type { TelemetryConfig } from "./types";
import { Tracer } from "./Tracer";
import { MetricsCollector } from "./MetricsCollector";
import { MemorySystem } from "@cowork/core";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const TELEMETRY_DIR = "telemetry";

export class TelemetryService {
  readonly tracer: Tracer;
  readonly metrics: MetricsCollector;
  private config: TelemetryConfig;
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(config: TelemetryConfig) {
    this.config = { enabled: true, retentionDays: 30, ...config };
    this.metrics = new MetricsCollector();
    this.tracer = new Tracer((span) => {
      if (this.config.enabled) {
        this.metrics.histogram("span.duration", span.durationMs ?? 0, {
          name: span.name,
          status: span.status,
        });
      }
    });

    if (this.config.enabled) {
      this.flushTimer = setInterval(() => void this.flush(), 60_000);
    }
  }

  // ── Instrument agent loop events ───────────────────────────────────────────

  recordAgentTurn(opts: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    toolsUsed: string[];
    durationMs: number;
    error?: string;
  }): void {
    this.metrics.counter("agent.turns", { provider: opts.provider });
    this.metrics.counter("agent.input_tokens", { provider: opts.provider }, opts.inputTokens);
    this.metrics.counter("agent.output_tokens", { provider: opts.provider }, opts.outputTokens);
    this.metrics.histogram("agent.turn_duration_ms", opts.durationMs, {
      provider: opts.provider,
      model: opts.model,
    });
    for (const tool of opts.toolsUsed) {
      this.metrics.counter("tool.calls", { tool });
    }
    if (opts.error) {
      this.metrics.counter("agent.errors", { provider: opts.provider });
    }
  }

  recordMemoryOp(op: "save" | "search" | "delete", durationMs: number): void {
    this.metrics.counter("memory.ops", { op });
    this.metrics.histogram("memory.op_duration_ms", durationMs, { op });
  }

  getSummary(): Record<string, unknown> {
    return this.metrics.summary();
  }

  stop(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private async flush(): Promise<void> {
    const dir = path.join(
      MemorySystem.rootFor(this.config.projectRoot),
      TELEMETRY_DIR
    );
    await mkdir(dir, { recursive: true });

    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(dir, `metrics-${today}.jsonl`);

    const points = this.metrics.recentPoints(500);
    if (points.length === 0) return;

    const lines = points.map((p) => JSON.parse(JSON.stringify(p))).map((p) => JSON.stringify(p)).join("\n") + "\n";
    
    // Bun.write can append if we read first
    const existing = await Bun.file(file).text().catch(() => "");
    await Bun.write(file, existing + lines);

    // Optional OTLP export
    if (this.config.exportOtlpUrl) {
      await this.exportOtlp(points);
    }
  }

  private async exportOtlp(
    points: any[]
  ): Promise<void> {
    try {
      await fetch(this.config.exportOtlpUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceMetrics: [{ metrics: points }] }),
      });
    } catch { /* best effort */ }
  }
}
