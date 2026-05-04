export interface ResearchJob {
  id: string;
  question: string;
  status: "queued" | "running" | "done" | "failed";
  answer?: string;
  steps?: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutoResearchConfig {
  projectRoot: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  outputToWiki?: boolean;     // default true
  outputToMemory?: boolean;   // default true
  verbose?: boolean;
}
