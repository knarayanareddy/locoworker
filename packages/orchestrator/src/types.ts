export type AgentRole =
  | "planner"    // breaks goal into tasks
  | "executor"   // runs a specific task with tools
  | "reviewer"   // reviews executor output and decides pass/fail/retry
  | "synthesizer" // combines outputs into final answer
  | "critic";    // adversarial — challenges assumptions

export interface AgentSpec {
  id: string;
  role: AgentRole;
  systemPromptOverride?: string;
  tools?: string[];     // tool names available to this agent (subset of global tools)
  maxTurns?: number;
  model?: string;       // override base model for this agent
}

export interface OrchestrationPlan {
  goal: string;
  tasks: Array<{
    taskId: string;
    description: string;
    assignedTo: AgentRole;
    dependsOn: string[];  // taskId list — DAG
  }>;
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  role: AgentRole;
  output: string;
  status: "done" | "failed" | "needs_review";
  reviewNotes?: string;
}

export interface OrchestrationResult {
  goal: string;
  plan: OrchestrationPlan;
  taskResults: TaskResult[];
  synthesis: string;
  totalTurns: number;
  completedAt: string;
}
