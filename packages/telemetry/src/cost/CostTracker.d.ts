export interface CostRecord {
    sessionId: string;
    model: string;
    provider: string;
    projectRoot: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    timestamp: string;
}
export interface CostSummary {
    totalSessions: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    formattedCost: string;
    byModel: Record<string, {
        sessions: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
    }>;
    byProvider: Record<string, {
        sessions: number;
        costUsd: number;
    }>;
}
export declare class CostTracker {
    private ledgerPath;
    constructor();
    init(): Promise<void>;
    record(record: CostRecord): Promise<void>;
    trackSession(opts: {
        sessionId: string;
        model: string;
        provider: string;
        projectRoot: string;
        inputTokens: number;
        outputTokens: number;
    }): Promise<CostRecord>;
    summarize(days?: number): Promise<CostSummary>;
}
//# sourceMappingURL=CostTracker.d.ts.map