import { randomUUID } from "node:crypto";
import type {
  OrchestratorTask,
  TaskPriority,
  TaskStatus,
  TaskQueueStats,
} from "./types.js";

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export class TaskQueue {
  private tasks = new Map<string, OrchestratorTask>();
  private persistencePath?: string;

  constructor(projectRoot?: string) {
    if (projectRoot) {
      const { join } = require("node:path");
      this.persistencePath = join(projectRoot, ".cowork", "tasks.ndjson");
    }
  }

  private async persist(): Promise<void> {
    if (!this.persistencePath) return;
    try {
      const { mkdir, writeFile } = require("node:fs/promises");
      const { dirname } = require("node:path");
      await mkdir(dirname(this.persistencePath), { recursive: true });
      const content = [...this.tasks.values()]
        .map((t) => JSON.stringify(t))
        .join("\n") + "\n";
      await writeFile(this.persistencePath, content, "utf8");
    } catch {
      // ignore
    }
  }

  enqueue(opts: {
    prompt: string;
    context?: string;
    priority?: TaskPriority;
    parentId?: string;
    allowedTools?: string[];
    maxTurns?: number;
    systemPrompt?: string;
  }): OrchestratorTask {
    const task: OrchestratorTask = {
      id: randomUUID(),
      parentId: opts.parentId,
      prompt: opts.prompt,
      context: opts.context,
      priority: opts.priority ?? "normal",
      status: "queued",
      createdAt: new Date().toISOString(),
      inputTokens: 0,
      outputTokens: 0,
      turns: 0,
      allowedTools: opts.allowedTools,
      maxTurns: opts.maxTurns,
      systemPrompt: opts.systemPrompt,
    };
    this.tasks.set(task.id, task);
    this.persist();
    return task;
  }

  dequeue(): OrchestratorTask | null {
    const queued = [...this.tasks.values()]
      .filter((t) => t.status === "queued")
      .sort(
        (a, b) =>
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
          a.createdAt.localeCompare(b.createdAt)
      );
    return queued[0] ?? null;
  }

  assign(taskId: string, workerId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "queued") return false;
    task.status = "assigned";
    task.assignedWorkerId = workerId;
    task.startedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  markRunning(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "running";
      this.persist();
    }
  }

  complete(
    taskId: string,
    result: string,
    tokens: { input: number; output: number },
    turns: number
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = "complete";
    task.result = result;
    task.completedAt = new Date().toISOString();
    task.inputTokens = tokens.input;
    task.outputTokens = tokens.output;
    task.turns = turns;
    this.persist();
  }

  fail(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = "failed";
    task.error = error;
    task.completedAt = new Date().toISOString();
    this.persist();
  }

  cancel(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === "queued") task.status = "cancelled";
  }

  get(taskId: string): OrchestratorTask | undefined {
    return this.tasks.get(taskId);
  }

  list(filter?: { status?: TaskStatus; parentId?: string }): OrchestratorTask[] {
    let tasks = [...this.tasks.values()];
    if (filter?.status) tasks = tasks.filter((t) => t.status === filter.status);
    if (filter?.parentId) tasks = tasks.filter((t) => t.parentId === filter.parentId);
    return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  stats(): TaskQueueStats {
    const all = [...this.tasks.values()];
    return {
      queued: all.filter((t) => t.status === "queued").length,
      running: all.filter((t) => t.status === "running").length,
      complete: all.filter((t) => t.status === "complete").length,
      failed: all.filter((t) => t.status === "failed").length,
      total: all.length,
    };
  }

  clear(): void {
    this.tasks.clear();
  }
}
