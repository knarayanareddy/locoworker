import type { SessionAnalytics, TurnStat } from "./types.js";
/**
 * Collects per-session analytics in-memory during a session,
 * then persists to ~/.cowork/analytics/<sessionId>.json on completion.
 */
export declare class SessionAnalyticsCollector {
    private analyticsDir;
    private data;
    private toolTimers;
    constructor(opts: {
        sessionId: string;
        projectRoot: string;
        provider: string;
        model: string;
    });
    init(): Promise<void>;
    recordTurn(turn: TurnStat): void;
    recordToolStart(toolName: string): void;
    recordToolEnd(toolName: string, isError: boolean): void;
    complete(costUsd: number): void;
    persist(): Promise<void>;
    getSnapshot(): SessionAnalytics;
}
//# sourceMappingURL=SessionAnalyticsCollector.d.ts.map