import type { KairosConfig, KairosTask } from "./types";
import { EventEmitter } from "events";
export declare class KAIROSDaemon extends EventEmitter {
    private config;
    private tasks;
    private running;
    private tickTimer?;
    private activeTasks;
    constructor(config: KairosConfig);
    register(task: KairosTask): this;
    unregister(taskId: string): this;
    start(): void;
    stop(): void;
    isRunning(): boolean;
    getTask(id: string): KairosTask | undefined;
    listTasks(): KairosTask[];
    private tick;
    private runTask;
}
//# sourceMappingURL=KAIROSDaemon.d.ts.map