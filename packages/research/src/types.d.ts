import type { KairosTask } from "@cowork/kairos";
export interface ResearchConfig {
    projectRoot: string;
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    taskMeta?: KairosTask;
    maxTurns?: number;
    outputToWiki?: boolean;
    outputToMemory?: boolean;
}
export interface ResearchJob {
    id: string;
    question: string;
    status: "queued" | "running" | "done" | "failed";
    startedAt?: string;
    completedAt?: string;
    answer?: string;
    sources?: string[];
    wikiSlug?: string;
    error?: string;
}
export interface ResearchQueueEntry {
    id: string;
    question: string;
    priority: number;
    addedAt: string;
    tags?: string[];
}
//# sourceMappingURL=types.d.ts.map