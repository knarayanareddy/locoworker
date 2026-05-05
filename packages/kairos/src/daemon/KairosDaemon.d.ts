import { TaskScheduler } from "../scheduler/TaskScheduler.js";
import type { ScheduledTask } from "../scheduler/types.js";
export interface DaemonConfig {
    projectRoot: string;
    /** Called when a scheduled task fires with its agent prompt */
    onTaskPrompt: (prompt: string, task: ScheduledTask) => Promise<void>;
    /** If true, watch project files and trigger "on-file-change" tasks */
    enableFileWatch?: boolean;
}
/**
 * KairosDaemon: Background task scheduler + file watcher.
 * Runs inside the same Bun process (no separate daemon process in Phase 6).
 * Phase 7 will extract this into a standalone daemon via Bun.serve + IPC.
 */
export declare class KairosDaemon {
    readonly scheduler: TaskScheduler;
    private watcher;
    private config;
    private fileUnwatchers;
    private running;
    constructor(config: DaemonConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
}
//# sourceMappingURL=KairosDaemon.d.ts.map