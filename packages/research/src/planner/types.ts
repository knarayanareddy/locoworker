export type ResearchStepKind = "search" | "read" | "analyze" | "synthesize" | "verify" | "write";

export interface ResearchStep {
  id: string;
  kind: ResearchStepKind;
  description: string;
  prompt: string;
  dependsOn: string[];
  completed: boolean;
  result?: string;
  tokens?: { input: number; output: number };
}

export interface ResearchPlan {
  id: string;
  question: string;
  hypothesis?: string;
  steps: ResearchStep[];
  createdAt: string;
}

export type ResearchStatus = "planned" | "in-progress" | "complete" | "failed" | "cancelled";

export interface ResearchSession {
  id: string;
  question: string;
  plan: ResearchPlan;
  status: ResearchStatus;
  findings: ResearchFinding[];
  report?: string;
  startedAt: string;
  completedAt?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface ResearchFinding {
  id: string;
  stepId: string;
  kind: "fact" | "contradiction" | "gap" | "hypothesis" | "conclusion";
  content: string;
  confidence: number;
  source?: string;
}
