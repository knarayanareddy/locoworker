import type { ResearchConfig, ResearchJob, ResearchQueueEntry } from "./types";
export declare class AutoResearch {
    private config;
    private queueDir;
    constructor(config: ResearchConfig);
    enqueue(question: string, priority?: number, tags?: string[]): Promise<string>;
    listQueue(): Promise<ResearchQueueEntry[]>;
    runBackgroundPass(): Promise<void>;
    runJob(id: string, question: string, tags?: string[]): Promise<ResearchJob>;
    private conductResearch;
    private loadQueue;
    private persistJob;
}
//# sourceMappingURL=AutoResearch.d.ts.map