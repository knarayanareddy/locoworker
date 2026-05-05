export interface ResearchTaskMeta {
  id: string;
  name: string;
  description: string;
}

export interface ResearchConfig {
  projectRoot: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  taskMeta?: ResearchTaskMeta;
  maxTurns?: number;        // default 6
  outputToWiki?: boolean;   // default true
  outputToMemory?: boolean; // default true
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
  priority: number;    // 1 (low) → 10 (high)
  addedAt: string;
  tags?: string[];
}
