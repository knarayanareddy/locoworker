export type TaskStatus = "pending" | "running" | "complete" | "failed" | "cancelled";
export type TaskKind = "once" | "interval" | "cron" | "on-file-change";
export interface ScheduledTask {
    id: string;
    name: string;
    kind: TaskKind;
    /** ISO date string for "once" tasks */
    runAt?: string;
    /** Milliseconds for "interval" tasks */
    intervalMs?: number;
    /** Cron expression for "cron" tasks (Phase 7 full cron parser) */
    cronExpr?: string;
    /** Glob pattern for "on-file-change" tasks */
    watchGlob?: string;
    /** The agent prompt to run when this task fires */
    prompt: string;
    projectRoot: string;
    status: TaskStatus;
    lastRunAt?: string;
    nextRunAt?: string;
    runCount: number;
    maxRuns?: number;
}
//# sourceMappingURL=types.d.ts.map