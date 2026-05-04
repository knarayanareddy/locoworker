import type { MetricPoint } from "./types";
export declare class MetricsCollector {
    private counters;
    private gauges;
    private histograms;
    private points;
    counter(name: string, labels?: Record<string, string>, delta?: number): void;
    gauge(name: string, value: number, labels?: Record<string, string>): void;
    histogram(name: string, value: number, labels?: Record<string, string>): void;
    summary(): Record<string, unknown>;
    recentPoints(limit?: number): MetricPoint[];
    reset(): void;
}
//# sourceMappingURL=MetricsCollector.d.ts.map