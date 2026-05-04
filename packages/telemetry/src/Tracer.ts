import type { Span, SpanStatus, SpanEvent, Trace } from "./types";
import { randomUUID } from "node:crypto";

export class Tracer {
  private activeSpans = new Map<string, Span>();
  private completedTraces: Trace[] = [];
  private onSpanEnd?: (span: Span) => void;

  constructor(onSpanEnd?: (span: Span) => void) {
    this.onSpanEnd = onSpanEnd;
  }

  startTrace(name: string, attributes: Record<string, string | number | boolean> = {}): Span {
    const traceId = randomUUID();
    const span = this.createSpan(name, traceId, undefined, attributes);
    return span;
  }

  startSpan(
    name: string,
    parentSpanOrTraceId: Span | string,
    attributes: Record<string, string | number | boolean> = {}
  ): Span {
    const traceId =
      typeof parentSpanOrTraceId === "string"
        ? parentSpanOrTraceId
        : parentSpanOrTraceId.traceId;
    const parentId =
      typeof parentSpanOrTraceId === "string" ? undefined : parentSpanOrTraceId.id;
    return this.createSpan(name, traceId, parentId, attributes);
  }

  endSpan(
    spanOrId: Span | string,
    status: SpanStatus = "ok",
    error?: string
  ): Span {
    const id = typeof spanOrId === "string" ? spanOrId : spanOrId.id;
    const span = this.activeSpans.get(id);
    if (!span) throw new Error(`Span not found: ${id}`);

    span.endMs = Date.now();
    span.durationMs = span.endMs - span.startMs;
    span.status = status;
    if (error) span.error = error;

    this.activeSpans.delete(id);
    this.onSpanEnd?.(span);

    // If this is a root span, finalize the trace
    if (!span.parentId) {
      this.finalizeTrace(span);
    }

    return span;
  }

  addEvent(spanOrId: Span | string, name: string, attributes?: Record<string, string | number | boolean>): void {
    const id = typeof spanOrId === "string" ? spanOrId : spanOrId.id;
    const span = this.activeSpans.get(id);
    if (!span) return;
    span.events.push({ name, ts: Date.now(), attributes });
  }

  setAttribute(spanOrId: Span | string, key: string, value: string | number | boolean): void {
    const id = typeof spanOrId === "string" ? spanOrId : spanOrId.id;
    const span = this.activeSpans.get(id);
    if (span) span.attributes[key] = value;
  }

  getRecentTraces(limit = 20): Trace[] {
    return this.completedTraces.slice(-limit);
  }

  private createSpan(
    name: string,
    traceId: string,
    parentId?: string,
    attributes: Record<string, string | number | boolean> = {}
  ): Span {
    const span: Span = {
      id: randomUUID(),
      traceId,
      parentId,
      name,
      startMs: Date.now(),
      status: "ok",
      attributes: { ...attributes },
      events: [],
    };
    this.activeSpans.set(span.id, span);
    return span;
  }

  private finalizeTrace(rootSpan: Span): void {
    // Collect all spans with matching traceId
    const spans = [rootSpan];
    // Note: completed spans already removed from activeSpans
    const trace: Trace = {
      id: rootSpan.traceId,
      rootSpanId: rootSpan.id,
      spans,
      startMs: rootSpan.startMs,
      endMs: rootSpan.endMs,
    };
    this.completedTraces.push(trace);
    // Keep last 500 traces in memory
    if (this.completedTraces.length > 500) {
      this.completedTraces.shift();
    }
  }
}
