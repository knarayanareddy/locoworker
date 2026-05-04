export type KairosTaskStatus = "idle" | "running" | "done" | "failed" | "skipped";

export interface KairosTask {
  id: string;
  name: string;
  description: string;
  intervalMs: number;           // how often to fire
  lastRunAt?: number;           // epoch ms
  lastStatus?: KairosTaskStatus;
  lastError?: string;
  enabled: boolean;
  runImmediately?: boolean;     // run on first tick even if interval not elapsed
}

export interface KairosConfig {
  tickIntervalMs: number;       // default 30_000 (30s)
  projectRoot: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  verbose?: boolean;
}

export interface KairosEvent {
  type: "tick" | "task_start" | "task_done" | "task_failed" | "daemon_start" | "daemon_stop";
  taskId?: string;
  taskName?: string;
  message?: string;
  ts: number;
}
