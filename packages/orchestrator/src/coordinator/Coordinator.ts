import { randomUUID } from "node:crypto";
import { queryLoop } from "@cowork/core";
import type { QueryEngine, ToolDefinition } from "@cowork/core";
import { TaskQueue } from "../queue/TaskQueue.js";
import { WorkerPool } from "../worker/WorkerPool.js";
import type { OrchestratorTask, TaskPriority } from "../queue/types.js";
import type { WorkerResult } from "../worker/AgentWorker.js";

export interface CoordinatorConfig {
  engine: QueryEngine;
  tools: ToolDefinition[];
  systemPrompt: string;
  workerCount?: number;
  enablePlanning?: boolean;
}

export interface OrchestrationResult {
  id: string;
  originalPrompt: string;
  plan?: string[];
  tasks: OrchestratorTask[];
  results: WorkerResult[];
  synthesis: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
}

const DECOMPOSE_SYSTEM_PROMPT = `You are a task decomposition coordinator.
Given a complex prompt, decompose it into a list of smaller, independent subtasks
that can be executed in parallel by worker agents.

Format your response as:
PLAN_SUMMARY: <one sentence describing the overall plan>
SUBTASKS:
- <subtask 1 prompt>
- <subtask 2 prompt>
- <subtask 3 prompt>

Keep each subtask focused and self-contained.
Maximum 6 subtasks. If the task is simple, output just 1 subtask.`;

export class Coordinator {
  private queue: TaskQueue;
  private pool: WorkerPool;
  private config: CoordinatorConfig;

  constructor(config: CoordinatorConfig) {
    this.config = config;
    // We assume engine.projectRoot or similar is available, but let's try to get it from settings if not.
    // For now, we'll try to find where we can get a project root.
    // Actually, CoordinatorConfig doesn't have it. Let's add it or use process.cwd().
    this.queue = new TaskQueue(process.cwd());
    this.pool = new WorkerPool({
      engine: config.engine,
      tools: config.tools,
      defaultSystemPrompt: config.systemPrompt,
      size: config.workerCount ?? 3,
    });
  }

  async run(
    prompt: string,
    opts?: { priority?: TaskPriority; maxParallelTasks?: number }
  ): Promise<OrchestrationResult> {
    const id = randomUUID();
    const start = Date.now();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    let subtasks: string[] = [prompt];
    let planSummary: string | undefined;

    if (this.config.enablePlanning) {
      const decomposition = await this.decompose(prompt);
      subtasks = decomposition.subtasks;
      planSummary = decomposition.summary;
      totalInputTokens += decomposition.inputTokens;
      totalOutputTokens += decomposition.outputTokens;
    }

    const tasks = subtasks.map((p) =>
      this.queue.enqueue({
        prompt: p,
        priority: opts?.priority ?? "normal",
        parentId: id,
      })
    );

    const maxParallel = Math.min(
      opts?.maxParallelTasks ?? this.config.workerCount ?? 3,
      tasks.length
    );

    const results = await this.executeWithConcurrencyLimit(tasks, maxParallel);

    for (const r of results) {
      totalInputTokens += r.inputTokens;
      totalOutputTokens += r.outputTokens;
      if (r.error) {
        this.queue.fail(r.taskId, r.error);
      } else {
        this.queue.complete(r.taskId, r.output, {
          input: r.inputTokens,
          output: r.outputTokens,
        }, r.turns);
      }
    }

    const synthesis = await this.synthesize(prompt, results);
    totalInputTokens += synthesis.inputTokens;
    totalOutputTokens += synthesis.outputTokens;

    return {
      id,
      originalPrompt: prompt,
      plan: planSummary ? [planSummary, ...subtasks] : undefined,
      tasks,
      results,
      synthesis: synthesis.text,
      totalInputTokens,
      totalOutputTokens,
      durationMs: Date.now() - start,
    };
  }

  getQueueStats() {
    return this.queue.stats();
  }

  getPoolStats() {
    return this.pool.getStats();
  }

  private async decompose(
    prompt: string
  ): Promise<{ subtasks: string[]; summary: string; inputTokens: number; outputTokens: number }> {
    let rawOutput = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const event of queryLoop(
        `Decompose this task into subtasks:\n\n${prompt}`,
        {
          engine: this.config.engine,
          systemPrompt: DECOMPOSE_SYSTEM_PROMPT,
          tools: [],
          maxTurns: 1,
        }
      )) {
        if (event.type === "text") rawOutput += event.text;
        if (event.type === "complete") {
          inputTokens = event.usage?.inputTokens ?? 0;
          outputTokens = event.usage?.outputTokens ?? 0;
        }
      }
    } catch {
      return { subtasks: [prompt], summary: prompt, inputTokens: 0, outputTokens: 0 };
    }

    const summary =
      rawOutput.match(/PLAN_SUMMARY:\s*(.+?)(?=\nSUBTASKS:|$)/s)?.[1]?.trim() ?? prompt;

    const subtaskBlock = rawOutput.match(/SUBTASKS:\s*\n([\s\S]+)/)?.[1] ?? "";
    const subtasks = subtaskBlock
      .split("\n")
      .filter((l) => l.trim().startsWith("- "))
      .map((l) => l.replace(/^- /, "").trim())
      .filter(Boolean);

    return {
      subtasks: subtasks.length > 0 ? subtasks : [prompt],
      summary,
      inputTokens,
      outputTokens,
    };
  }

  private async synthesize(
    originalPrompt: string,
    results: WorkerResult[]
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    if (results.length === 1 && results[0]) {
      return { text: results[0].output, inputTokens: 0, outputTokens: 0 };
    }

    const resultsText = results
      .map((r, i) => `## Worker ${i + 1} Result\n${r.error ? `ERROR: ${r.error}` : r.output}`)
      .join("\n\n");

    const synthPrompt = [
      `Original task: ${originalPrompt}`,
      ``,
      `${results.length} workers completed subtasks. Synthesize their outputs into a unified response:`,
      ``,
      resultsText,
    ].join("\n");

    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const event of queryLoop(synthPrompt, {
        engine: this.config.engine,
        systemPrompt: this.config.systemPrompt,
        tools: [],
        maxTurns: 1,
      })) {
        if (event.type === "text") text += event.text;
        if (event.type === "complete") {
          inputTokens = event.usage?.inputTokens ?? 0;
          outputTokens = event.usage?.outputTokens ?? 0;
        }
      }
    } catch {
      text = results.map((r) => r.output).join("\n\n---\n\n");
    }

    return { text, inputTokens, outputTokens };
  }

  private async executeWithConcurrencyLimit(
    tasks: OrchestratorTask[],
    limit: number
  ): Promise<WorkerResult[]> {
    const results: WorkerResult[] = [];
    const chunks: OrchestratorTask[][] = [];

    for (let i = 0; i < tasks.length; i += limit) {
      chunks.push(tasks.slice(i, i + limit));
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((task) => this.pool.executeOnAvailable(task))
      );
      results.push(...chunkResults);
    }

    return results;
  }
}
