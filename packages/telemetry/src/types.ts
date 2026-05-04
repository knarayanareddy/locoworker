export type SpanStatus = "ok" | "error" | "timeout";

export interface Span {
  id: string;
  parentId?: string;
  traceId: string;
  name: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
  status: SpanStatus;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  error?: string;
}

export interface SpanEvent {
  name: string;
  ts: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface Trace {
  id: string;
  rootSpanId: string;
  spans: Span[];
  startMs: number;
  endMs?: number;
  metadata?: Record<string, unknown>;
}

export interface MetricPoint {
  name: string;
  value: number;
  ts: number;
  labels: Record<string, string>;
}

export interface TelemetryConfig {
  projectRoot: string;
  enabled?: boolean;
  retentionDays?: number;    // default 30
  exportOtlpUrl?: string;    // optional OTLP HTTP endpoint
}
