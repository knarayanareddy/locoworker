export interface ToolUsageStat {
  toolName: string;
  callCount: number;
  errorCount: number;
  avgDurationMs: number;
  totalDurationMs: number;
}

export interface TurnStat {
  turnIndex: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  durationMs: number;
}

export interface SessionAnalytics {
  sessionId: string;
  projectRoot: string;
  provider: string;
  model: string;
  startedAt: string;
  completedAt?: string;
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalToolCalls: number;
  totalDurationMs: number;
  costUsd: number;
  toolUsage: ToolUsageStat[];
  turns: TurnStat[];
}

export interface AggregateReport {
  generatedAt: string;
  periodDays: number;
  totalSessions: number;
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalToolCalls: number;
  totalCostUsd: number;
  topTools: ToolUsageStat[];
  sessionsByDay: Record<string, number>;
  avgTurnsPerSession: number;
  avgCostPerSession: number;
}
