import { TaskScheduler } from "../scheduler/TaskScheduler.js";
import { FileWatcher } from "../watcher/FileWatcher.js";
import type { ScheduledTask } from "../scheduler/types.js";

export interface DaemonConfig {
  projectRoot: string;
  /** Called when a scheduled task fires with its agent prompt */
  onTaskPrompt: (prompt: string, task: ScheduledTask) => Promise<void>;
  /** If true, watch project files and trigger "on-file-change" tasks */
  enableFileWatch?: boolean;
}

/**
 * KairosDaemon: Background task scheduler + file watcher.
 * Runs inside the same Bun process (no separate daemon process in Phase 6).
 * Phase 7 will extract this into a standalone daemon via Bun.serve + IPC.
 */
export class KairosDaemon {
  readonly scheduler: TaskScheduler;
  private watcher: FileWatcher;
  private config: DaemonConfig;
  private fileUnwatchers: Array<() => void> = [];
  private running = false;

  constructor(config: DaemonConfig) {
    this.config = config;
    this.scheduler = new TaskScheduler(config.projectRoot);
    this.watcher = new FileWatcher();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.scheduler.init();

    this.scheduler.onTaskFire(async (task) => {
      await this.config.onTaskPrompt(task.prompt, task);
    });

    if (this.config.enableFileWatch) {
      // Watch the project root for "on-file-change" tasks
      const stop = this.watcher.watch(
        this.config.projectRoot,
        async (event) => {
          const tasks = this.scheduler
            .list()
            .filter((t) => t.kind === "on-file-change" && t.status === "pending");

          for (const task of tasks) {
            if (!task.watchGlob) continue;
            // Simple glob-to-regex: *.ts → /\.ts$/
            const regex = new RegExp(
              task.watchGlob
                .replace(".", "\\.")
                .replace("*", ".*")
                .replace("?", ".")
            );
            if (regex.test(event.filename)) {
              await this.config.onTaskPrompt(
                task.prompt.replace("{{file}}", event.absolutePath),
                task
              );
            }
          }
        },
        { recursive: true }
      );
      this.fileUnwatchers.push(stop);
    }
  }

  async stop(): Promise<void> {
    for (const stop of this.fileUnwatchers) stop();
    this.fileUnwatchers = [];
    this.watcher.stopAll();
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}
