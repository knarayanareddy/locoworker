import { randomUUID } from "node:crypto";
import { queryLoop } from "@cowork/core";
import type { QueryEngine, ToolDefinition } from "@cowork/core";
import type { OrchestratorTask } from "../queue/types.js";

export type WorkerStatus = "idle" | "busy" | "error" | "stopped";

export interface WorkerConfig {
  id?: string;
  engine: QueryEngine;
  tools: ToolDefinition[];
  defaultSystemPrompt: string;
  maxConcurrentTasks?: number;
}

export interface WorkerResult {
  taskId: string;
  workerId: string;
  output: string;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  durationMs: number;
  error?: string;
}

export class AgentWorker {
  readonly id: string;
  private status: WorkerStatus = "idle";
  private currentTaskId: string | null = null;
  private config: WorkerConfig;

  constructor(config: WorkerConfig) {
    this.id = config.id ?? `worker-${randomUUID().slice(0, 8)}`;
    this.config = config;
  }

  getStatus(): WorkerStatus {
    return this.status;
  }

  getCurrentTaskId(): string | null {
    return this.currentTaskId;
  }

  isIdle(): boolean {
    return this.status === "idle";
  }

  async execute(task: OrchestratorTask): Promise<WorkerResult> {
    this.status = "busy";
    this.currentTaskId = task.id;
    const start = Date.now();

    let output = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let turns = 0;

    const tools =
      task.allowedTools && task.allowedTools.length > 0
        ? this.config.tools.filter((t) => task.allowedTools!.includes(t.name))
        : this.config.tools;

    const prompt = task.context
      ? `Context:\n${task.context}\n\nTask:\n${task.prompt}`
      : task.prompt;

    try {
      for await (const event of queryLoop(prompt, {
        engine: this.config.engine,
        systemPrompt: task.systemPrompt ?? this.config.defaultSystemPrompt,
        tools,
        maxTurns: task.maxTurns ?? 20,
        requestApproval: async () => true,
      })) {
        if (event.type === "text") output += event.text;
        if (event.type === "turn_start") turns++;
        if (event.type === "complete") {
          inputTokens = event.usage?.inputTokens ?? 0;
          outputTokens = event.usage?.outputTokens ?? 0;
        }
      }

      this.status = "idle";
      this.currentTaskId = null;

      return {
        taskId: task.id,
        workerId: this.id,
        output,
        inputTokens,
        outputTokens,
        turns,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      this.status = "idle";
      this.currentTaskId = null;

      return {
        taskId: task.id,
        workerId: this.id,
        output,
        inputTokens,
        outputTokens,
        turns,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  stop(): void {
    this.status = "stopped";
  }
}
