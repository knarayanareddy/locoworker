import type { ToolDefinition } from "@cowork/core";

export type AgentRole = "planner" | "executor" | "synthesizer" | "reviewer" | "critic";

export interface OrchestratorPlan {
  goal: string;
  tasks: Array<{
    id: string;
    description: string;
    dependencies: string[]; // ids
    assignedRole: AgentRole;
    status: "pending" | "running" | "completed" | "failed";
    result?: string;
  }>;
}

export interface OrchestratorConfig {
  projectRoot: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  tools: ToolDefinition[];
  maxParallelTasks?: number; // default 1
}
