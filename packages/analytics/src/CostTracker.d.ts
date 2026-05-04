export interface UsageRecord {
    ts: string;
    sessionId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    tool?: string;
}
export interface DailySummary {
    date: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    byModel: Record<string, {
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
    }>;
    sessionCount: number;
}
export declare class CostTracker {
    private projectRoot;
    private sessionId;
    private records;
    constructor(projectRoot: string, sessionId: string);
    track(opts: {
        provider: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        tool?: string;
    }): UsageRecord;
    sessionSummary(): {
        totalInputTokens: number;
        totalOutputTokens: number;
        estimatedCostUsd: number;
        turnsTracked: number;
    };
    dailySummary(date?: string): Promise<DailySummary | null>;
    monthlySummary(yearMonth?: string): Promise<{
        month: string;
        totalCostUsd: number;
        totalTokens: number;
        dailyBreakdown: DailySummary[];
    }>;
    private append;
    private usageDir;
    private usageFile;
}
//# sourceMappingURL=CostTracker.d.ts.map