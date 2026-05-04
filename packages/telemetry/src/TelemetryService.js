import { Tracer } from "./Tracer";
import { MetricsCollector } from "./MetricsCollector";
import { MemorySystem } from "@cowork/core";
import path from "path";
import { mkdir } from "node:fs/promises";
const TELEMETRY_DIR = "telemetry";
export class TelemetryService {
    tracer;
    metrics;
    config;
    flushTimer;
    constructor(config) {
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
    recordAgentTurn(opts) {
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
    recordMemoryOp(op, durationMs) {
        this.metrics.counter("memory.ops", { op });
        this.metrics.histogram("memory.op_duration_ms", durationMs, { op });
    }
    getSummary() {
        return this.metrics.summary();
    }
    stop() {
        if (this.flushTimer)
            clearInterval(this.flushTimer);
    }
    // ── Persistence ────────────────────────────────────────────────────────────
    async flush() {
        const dir = path.join(MemorySystem.rootFor(this.config.projectRoot), TELEMETRY_DIR);
        await mkdir(dir, { recursive: true });
        const today = new Date().toISOString().slice(0, 10);
        const file = path.join(dir, `metrics-${today}.jsonl`);
        const points = this.metrics.recentPoints(500);
        if (points.length === 0)
            return;
        const lines = points.map((p) => JSON.stringify(p)).join("\n") + "\n";
        const existing = await Bun.file(file).text().catch(() => "");
        await Bun.write(file, existing + lines);
        // Optional OTLP export
        if (this.config.exportOtlpUrl) {
            await this.exportOtlp(points);
        }
    }
    async exportOtlp(points) {
        try {
            await fetch(this.config.exportOtlpUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resourceMetrics: [{ metrics: points }] }),
            });
        }
        catch { /* best effort */ }
    }
}
//# sourceMappingURL=TelemetryService.js.map