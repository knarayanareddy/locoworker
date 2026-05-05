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
