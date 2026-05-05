import { AgentWorker, type WorkerConfig, type WorkerResult } from "./AgentWorker.js";
import type { OrchestratorTask } from "../queue/types.js";

export interface PoolConfig extends Omit<WorkerConfig, "id"> {
  size: number;
}

export class WorkerPool {
  private workers: AgentWorker[] = [];

  constructor(config: PoolConfig) {
    for (let i = 0; i < config.size; i++) {
      this.workers.push(
        new AgentWorker({
          ...config,
          id: `worker-${i + 1}`,
        })
      );
    }
  }

  getIdleWorker(): AgentWorker | null {
    return this.workers.find((w) => w.isIdle()) ?? null;
  }

  async executeOnAvailable(
    task: OrchestratorTask,
    pollIntervalMs = 200
  ): Promise<WorkerResult> {
    while (true) {
      const worker = this.getIdleWorker();
      if (worker) return worker.execute(task);
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  async executeAll(tasks: OrchestratorTask[]): Promise<WorkerResult[]> {
    return Promise.all(tasks.map((t) => this.executeOnAvailable(t)));
  }

  getStats(): { total: number; idle: number; busy: number } {
    return {
      total: this.workers.length,
      idle: this.workers.filter((w) => w.isIdle()).length,
      busy: this.workers.filter((w) => !w.isIdle()).length,
    };
  }

  stopAll(): void {
    this.workers.forEach((w) => w.stop());
  }
}
