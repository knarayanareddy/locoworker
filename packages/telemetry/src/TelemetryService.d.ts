import type { TelemetryConfig } from "./types";
import { Tracer } from "./Tracer";
import { MetricsCollector } from "./MetricsCollector";
export declare class TelemetryService {
    readonly tracer: Tracer;
    readonly metrics: MetricsCollector;
    private config;
    private flushTimer?;
    constructor(config: TelemetryConfig);
    recordAgentTurn(opts: {
        provider: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        toolsUsed: string[];
        durationMs: number;
        error?: string;
    }): void;
    recordMemoryOp(op: "save" | "search" | "delete", durationMs: number): void;
    getSummary(): Record<string, unknown>;
    stop(): void;
    private flush;
    private exportOtlp;
}
//# sourceMappingURL=TelemetryService.d.ts.map