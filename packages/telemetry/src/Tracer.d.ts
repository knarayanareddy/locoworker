import type { Span, SpanStatus, Trace } from "./types";
export declare class Tracer {
    private activeSpans;
    private completedTraces;
    private onSpanEnd?;
    constructor(onSpanEnd?: (span: Span) => void);
    startTrace(name: string, attributes?: Record<string, string | number | boolean>): Span;
    startSpan(name: string, parentSpanOrTraceId: Span | string, attributes?: Record<string, string | number | boolean>): Span;
    endSpan(spanOrId: Span | string, status?: SpanStatus, error?: string): Span;
    addEvent(spanOrId: Span | string, name: string, attributes?: Record<string, string | number | boolean>): void;
    setAttribute(spanOrId: Span | string, key: string, value: string | number | boolean): void;
    getRecentTraces(limit?: number): Trace[];
    private createSpan;
    private finalizeTrace;
}
//# sourceMappingURL=Tracer.d.ts.map