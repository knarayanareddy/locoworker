import type { ScheduledTask, TaskKind } from "./types.js";
export declare class TaskScheduler {
    private tasks;
    private timers;
    private storagePath;
    private onFire?;
    constructor(projectRoot: string);
    init(): Promise<void>;
    onTaskFire(handler: (task: ScheduledTask) => Promise<void>): void;
    schedule(opts: {
        name: string;
        kind: TaskKind;
        prompt: string;
        projectRoot: string;
        runAt?: string;
        intervalMs?: number;
        cronExpr?: string;
        watchGlob?: string;
        maxRuns?: number;
    }): Promise<ScheduledTask>;
    cancel(taskId: string): Promise<boolean>;
    list(): ScheduledTask[];
    get(id: string): ScheduledTask | undefined;
    private startTimer;
    private fire;
    private load;
    private save;
}
//# sourceMappingURL=TaskScheduler.d.ts.map