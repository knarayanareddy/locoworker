import { randomUUID } from "node:crypto";
export class Tracer {
    activeSpans = new Map();
    completedTraces = [];
    onSpanEnd;
    constructor(onSpanEnd) {
        this.onSpanEnd = onSpanEnd;
    }
    startTrace(name, attributes = {}) {
        const traceId = randomUUID();
        const span = this.createSpan(name, traceId, undefined, attributes);
        return span;
    }
    startSpan(name, parentSpanOrTraceId, attributes = {}) {
        const traceId = typeof parentSpanOrTraceId === "string"
            ? parentSpanOrTraceId
            : parentSpanOrTraceId.traceId;
        const parentId = typeof parentSpanOrTraceId === "string" ? undefined : parentSpanOrTraceId.id;
        return this.createSpan(name, traceId, parentId, attributes);
    }
    endSpan(spanOrId, status = "ok", error) {
        const id = typeof spanOrId === "string" ? spanOrId : spanOrId.id;
        const span = this.activeSpans.get(id);
        if (!span)
            throw new Error(`Span not found: ${id}`);
        span.endMs = Date.now();
        span.durationMs = span.endMs - span.startMs;
        span.status = status;
        if (error)
            span.error = error;
        this.activeSpans.delete(id);
        this.onSpanEnd?.(span);
        // If this is a root span, finalize the trace
        if (!span.parentId) {
            this.finalizeTrace(span);
        }
        return span;
    }
    addEvent(spanOrId, name, attributes) {
        const id = typeof spanOrId === "string" ? spanOrId : spanOrId.id;
        const span = this.activeSpans.get(id);
        if (!span)
            return;
        span.events.push({ name, ts: Date.now(), attributes });
    }
    setAttribute(spanOrId, key, value) {
        const id = typeof spanOrId === "string" ? spanOrId : spanOrId.id;
        const span = this.activeSpans.get(id);
        if (span)
            span.attributes[key] = value;
    }
    getRecentTraces(limit = 20) {
        return this.completedTraces.slice(-limit);
    }
    createSpan(name, traceId, parentId, attributes = {}) {
        const span = {
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
    finalizeTrace(rootSpan) {
        // Collect all spans with matching traceId
        const spans = [rootSpan];
        // Note: completed spans already removed from activeSpans
        const trace = {
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
//# sourceMappingURL=Tracer.js.map