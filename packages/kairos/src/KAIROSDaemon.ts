import type { KairosConfig, KairosTask, KairosEvent, KairosTaskStatus } from "./types";
import { EventEmitter } from "events";

export class KAIROSDaemon extends EventEmitter {
  private config: KairosConfig;
  private tasks: Map<string, KairosTask> = new Map();
  private running = false;
  private tickTimer?: ReturnType<typeof setInterval>;
  private activeTasks = new Set<string>();

  constructor(config: KairosConfig) {
    super();
    this.config = {
      ...config,
    };
    if (!this.config.tickIntervalMs) this.config.tickIntervalMs = 30_000;
  }

  register(task: KairosTask): this {
    this.tasks.set(task.id, { ...task });
    return this;
  }

  unregister(taskId: string): this {
    this.tasks.delete(taskId);
    return this;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.emit("event", {
      type: "daemon_start",
      message: `KAIROS daemon started with ${this.tasks.size} task(s)`,
      ts: Date.now(),
    } satisfies KairosEvent);

    // Immediate pass for runImmediately tasks
    void this.tick();

    this.tickTimer = setInterval(() => {
      void this.tick();
    }, this.config.tickIntervalMs);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.emit("event", {
      type: "daemon_stop",
      message: "KAIROS daemon stopped",
      ts: Date.now(),
    } satisfies KairosEvent);
  }

  isRunning(): boolean {
    return this.running;
  }

  getTask(id: string): KairosTask | undefined {
    return this.tasks.get(id);
  }

  listTasks(): KairosTask[] {
    return [...this.tasks.values()];
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    this.emit("event", { type: "tick", ts: now } satisfies KairosEvent);

    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;
      if (this.activeTasks.has(task.id)) continue; // already running

      const elapsed = task.lastRunAt ? now - task.lastRunAt : Infinity;
      const shouldRun =
        elapsed >= task.intervalMs || (task.runImmediately && !task.lastRunAt);

      if (!shouldRun) continue;

      // Mark running immediately to prevent re-entry
      this.activeTasks.add(task.id);
      task.lastRunAt = now;

      this.emit("event", {
        type: "task_start",
        taskId: task.id,
        taskName: task.name,
        ts: now,
      } satisfies KairosEvent);

      // Run async, don't await (fire-and-forget per task)
      this.runTask(task).then((status) => {
        task.lastStatus = status;
        this.activeTasks.delete(task.id);
      });
    }
  }

  private async runTask(task: KairosTask): Promise<KairosTaskStatus> {
    try {
      // Dynamic import of task executor to keep daemon lightweight
      const { executeKairosTask } = await import("./executor.js");
      await executeKairosTask(task, this.config);

      this.emit("event", {
        type: "task_done",
        taskId: task.id,
        taskName: task.name,
        message: "completed",
        ts: Date.now(),
      } satisfies KairosEvent);

      return "done";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      task.lastError = message;

      this.emit("event", {
        type: "task_failed",
        taskId: task.id,
        taskName: task.name,
        message,
        ts: Date.now(),
      } satisfies KairosEvent);

      if (this.config.verbose) {
        console.error(`[KAIROS] task "${task.name}" failed:`, err);
      }
      return "failed";
    }
  }
}
