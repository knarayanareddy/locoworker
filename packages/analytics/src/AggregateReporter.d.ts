import type { AggregateReport } from "./types.js";
export declare class AggregateReporter {
    private analyticsDir;
    constructor();
    report(days?: number): Promise<AggregateReport>;
    formatReport(days?: number): Promise<string>;
    private loadSessions;
}
//# sourceMappingURL=AggregateReporter.d.ts.map