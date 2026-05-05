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
