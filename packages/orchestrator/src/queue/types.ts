export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskStatus =
  | "queued"
  | "assigned"
  | "running"
  | "complete"
  | "failed"
  | "cancelled";

export interface OrchestratorTask {
  id: string;
  parentId?: string;
  prompt: string;
  context?: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedWorkerId?: string;
  result?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  /** Optional: tools the worker is allowed to use */
  allowedTools?: string[];
  /** Optional: max turns for this task */
  maxTurns?: number;
  /** Optional: custom system prompt override */
  systemPrompt?: string;
}

export interface TaskQueueStats {
  queued: number;
  running: number;
  complete: number;
  failed: number;
  total: number;
}
