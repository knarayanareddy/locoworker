Phase 7 — Complete Implementation
What Phase 7 Is (derived from the full blueprint picture)
From phase6complete.md's "Remaining for Phase 7", the design doc's 24-part TOC, and the .env.example stubs already present, Phase 7 is the "Multi-Agent & Gateway" layer:

@cowork/orchestrator — real multi-agent orchestration: coordinator/worker pool, task queue, council/debate pattern, agent-to-agent messaging
@cowork/research — AutoResearch loop: plan → search → synthesize → verify → report, with wiki integration
@cowork/mirofish — simulation studio: multi-agent simulation rounds, state tracking, export to wiki/memory
@cowork/openclaw — messaging gateway: Telegram bot, HTTP gateway, rate limiting, routing to agent
@cowork/hermes — MCP server host: expose locoworker tools as an MCP server over stdio/SSE
Kairos daemon as a standalone Bun process with IPC client/server
Streaming providers: real Anthropic + OpenAI streaming implementations wired to Phase 6's StreamingProvider interface
Core: ReAct planning loop, beam search planner, enhanced queryLoop with planning mode
CLI: /research, /simulate, /council, /kairos, /hermes slash commands + REPL planning mode toggle
New workspace topology after Phase 7
text

locoworker/
├── apps/
│   ├── cowork-cli/              ← updated: new slash commands, planning mode, streaming
│   └── kairos-daemon/           ← NEW: standalone Bun daemon process
├── packages/
│   ├── core/                    ← updated: ReAct, beam planner, streaming loop
│   ├── graphify/                ← unchanged
│   ├── telemetry/               ← unchanged
│   ├── analytics/               ← unchanged
│   ├── security/                ← unchanged
│   ├── kairos/                  ← updated: IPC client + daemon launcher
│   ├── wiki/                    ← unchanged
│   ├── research/                ← UPGRADED from stub
│   ├── orchestrator/            ← UPGRADED from stub
│   ├── mirofish/                ← NEW
│   ├── openclaw/                ← NEW
│   ├── hermes/                  ← NEW
│   └── plugins/                 ← stub (Phase 8)
├── tsconfig.json                ← updated
└── phase7complete.md            ← NEW
PART A — @cowork/orchestrator
packages/orchestrator/package.json
JSON

{
  "name": "@cowork/orchestrator",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./coordinator": "./src/coordinator/index.ts",
    "./worker": "./src/worker/index.ts",
    "./council": "./src/council/index.ts",
    "./queue": "./src/queue/index.ts"
  },
  "dependencies": {
    "@cowork/core": "workspace:*",
    "@cowork/telemetry": "workspace:*",
    "@cowork/security": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "latest"
  }
}
packages/orchestrator/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" },
    { "path": "../telemetry" },
    { "path": "../security" }
  ]
}
packages/orchestrator/src/queue/types.ts
TypeScript

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
packages/orchestrator/src/queue/TaskQueue.ts
TypeScript

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
    return task;
  }

  /** Dequeue the highest-priority queued task. */
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
    return true;
  }

  markRunning(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) task.status = "running";
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
  }

  fail(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = "failed";
    task.error = error;
    task.completedAt = new Date().toISOString();
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
packages/orchestrator/src/queue/index.ts
TypeScript

export { TaskQueue } from "./TaskQueue.js";
export type {
  OrchestratorTask,
  TaskPriority,
  TaskStatus,
  TaskQueueStats,
} from "./types.js";
packages/orchestrator/src/worker/AgentWorker.ts
TypeScript

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

    // Filter tools to allowed subset if specified
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
        requestApproval: async () => true, // Workers auto-approve
      })) {
        if (event.type === "text") output += event.text;
        if (event.type === "turn_start") turns++;
        if (event.type === "complete") {
          inputTokens = event.totalInputTokens;
          outputTokens = event.totalOutputTokens;
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
packages/orchestrator/src/worker/WorkerPool.ts
TypeScript

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

  /** Get next idle worker, or null if all busy. */
  getIdleWorker(): AgentWorker | null {
    return this.workers.find((w) => w.isIdle()) ?? null;
  }

  /** Execute a task on the first available idle worker.
   *  Waits (polls) until a worker becomes free. */
  async executeOnAvailable(
    task: OrchestratorTask,
    pollIntervalMs = 200
  ): Promise<WorkerResult> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const worker = this.getIdleWorker();
      if (worker) return worker.execute(task);
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  /** Execute multiple tasks concurrently using the pool. */
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
packages/orchestrator/src/worker/index.ts
TypeScript

export { AgentWorker } from "./AgentWorker.js";
export { WorkerPool } from "./WorkerPool.js";
export type { WorkerConfig, WorkerResult, WorkerStatus } from "./AgentWorker.js";
export type { PoolConfig } from "./WorkerPool.js";
packages/orchestrator/src/coordinator/Coordinator.ts
TypeScript

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
  /** If true, coordinator plans task decomposition using the model */
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
    this.queue = new TaskQueue();
    this.pool = new WorkerPool({
      engine: config.engine,
      tools: config.tools,
      defaultSystemPrompt: config.systemPrompt,
      size: config.workerCount ?? 3,
    });
  }

  /** Execute a prompt through the full coordinator → worker → synthesis pipeline. */
  async run(
    prompt: string,
    opts?: { priority?: TaskPriority; maxParallelTasks?: number }
  ): Promise<OrchestrationResult> {
    const id = randomUUID();
    const start = Date.now();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Step 1: Plan (decompose into subtasks)
    let subtasks: string[] = [prompt];
    let planSummary: string | undefined;

    if (this.config.enablePlanning) {
      const decomposition = await this.decompose(prompt);
      subtasks = decomposition.subtasks;
      planSummary = decomposition.summary;
      totalInputTokens += decomposition.inputTokens;
      totalOutputTokens += decomposition.outputTokens;
    }

    // Step 2: Enqueue all subtasks
    const tasks = subtasks.map((p) =>
      this.queue.enqueue({
        prompt: p,
        priority: opts?.priority ?? "normal",
        parentId: id,
      })
    );

    // Step 3: Execute tasks via worker pool
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
        const task = this.queue.get(r.taskId);
        if (task) {
          this.queue.complete(r.taskId, r.output, {
            input: r.inputTokens,
            output: r.outputTokens,
          }, r.turns);
        }
      }
    }

    // Step 4: Synthesize results
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
          inputTokens = event.totalInputTokens;
          outputTokens = event.totalOutputTokens;
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
          inputTokens = event.totalInputTokens;
          outputTokens = event.totalOutputTokens;
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
packages/orchestrator/src/coordinator/index.ts
TypeScript

export { Coordinator } from "./Coordinator.js";
export type { CoordinatorConfig, OrchestrationResult } from "./Coordinator.js";
packages/orchestrator/src/council/CouncilDebate.ts
TypeScript

import { queryLoop } from "@cowork/core";
import type { QueryEngine, ToolDefinition } from "@cowork/core";

export interface CouncilMember {
  name: string;
  role: string;
  systemPrompt: string;
  /** Bias/perspective this member brings */
  perspective?: string;
}

export interface DebateRound {
  memberId: string;
  memberName: string;
  argument: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CouncilResult {
  question: string;
  members: CouncilMember[];
  rounds: DebateRound[][];
  consensus?: string;
  dissent?: string[];
  verdict: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
}

const DEFAULT_MEMBERS: CouncilMember[] = [
  {
    name: "Architect",
    role: "Systems architect",
    systemPrompt:
      "You are a systems architect. Evaluate proposals for technical soundness, scalability, and maintainability. Be rigorous and precise.",
    perspective: "technical correctness and long-term maintainability",
  },
  {
    name: "Pragmatist",
    role: "Pragmatic engineer",
    systemPrompt:
      "You are a pragmatic engineer. Evaluate proposals for simplicity, delivery speed, and practical tradeoffs. Challenge over-engineering.",
    perspective: "simplicity and delivery speed",
  },
  {
    name: "Skeptic",
    role: "Critical reviewer",
    systemPrompt:
      "You are a critical reviewer. Identify risks, failure modes, edge cases, and unstated assumptions. Be constructively critical.",
    perspective: "risk identification and failure modes",
  },
];

export class CouncilDebate {
  constructor(
    private engine: QueryEngine,
    private tools: ToolDefinition[],
    private members: CouncilMember[] = DEFAULT_MEMBERS
  ) {}

  async debate(
    question: string,
    opts?: { rounds?: number; maxTokensPerTurn?: number }
  ): Promise<CouncilResult> {
    const start = Date.now();
    const numRounds = opts?.rounds ?? 2;
    const allRounds: DebateRound[][] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    let priorArguments = "";

    for (let round = 0; round < numRounds; round++) {
      const roundResults: DebateRound[] = [];

      for (const member of this.members) {
        const prompt =
          round === 0
            ? [
                `Question for council debate:`,
                ``,
                question,
                ``,
                `State your position from your perspective as ${member.role}.`,
                `Be specific, concrete, and focused on "${member.perspective}".`,
                `Keep your response under 300 words.`,
              ].join("\n")
            : [
                `Council debate — Round ${round + 1}`,
                ``,
                `Original question: ${question}`,
                ``,
                `Previous arguments:`,
                priorArguments,
                ``,
                `Respond to the other council members' arguments from your perspective as ${member.role}.`,
                `You may update your position, defend it, or find common ground.`,
                `Keep your response under 200 words.`,
              ].join("\n");

        let argument = "";
        let inputTokens = 0;
        let outputTokens = 0;

        try {
          for await (const event of queryLoop(prompt, {
            engine: this.engine,
            systemPrompt: member.systemPrompt,
            tools: [],
            maxTurns: 1,
            maxTokens: opts?.maxTokensPerTurn ?? 600,
          })) {
            if (event.type === "text") argument += event.text;
            if (event.type === "complete") {
              inputTokens = event.totalInputTokens;
              outputTokens = event.totalOutputTokens;
            }
          }
        } catch (err) {
          argument = `[${member.name} could not respond: ${err instanceof Error ? err.message : String(err)}]`;
        }

        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        roundResults.push({
          memberId: member.name.toLowerCase(),
          memberName: member.name,
          argument,
          inputTokens,
          outputTokens,
        });
      }

      allRounds.push(roundResults);
      priorArguments = allRounds
        .flat()
        .map((r) => `**${r.memberName}**: ${r.argument}`)
        .join("\n\n");
    }

    // Synthesize verdict
    const verdict = await this.synthesizeVerdict(question, priorArguments);
    totalInputTokens += verdict.inputTokens;
    totalOutputTokens += verdict.outputTokens;

    return {
      question,
      members: this.members,
      rounds: allRounds,
      verdict: verdict.text,
      totalInputTokens,
      totalOutputTokens,
      durationMs: Date.now() - start,
    };
  }

  private async synthesizeVerdict(
    question: string,
    arguments_: string
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const prompt = [
      `You are a council moderator. Given the following debate, synthesize a final verdict.`,
      ``,
      `Question: ${question}`,
      ``,
      `Council arguments:`,
      arguments_,
      ``,
      `Produce:`,
      `1. A CONSENSUS statement where members agree`,
      `2. A VERDICT with the recommended course of action`,
      `3. Any key CAVEATS or DISSENTING points to keep in mind`,
      ``,
      `Format:`,
      `CONSENSUS: <what everyone agreed on>`,
      `VERDICT: <recommended action>`,
      `CAVEATS: <important caveats or dissent>`,
    ].join("\n");

    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const event of queryLoop(prompt, {
        engine: this.engine,
        systemPrompt: "You are an impartial council moderator producing clear, actionable verdicts.",
        tools: [],
        maxTurns: 1,
        maxTokens: 800,
      })) {
        if (event.type === "text") text += event.text;
        if (event.type === "complete") {
          inputTokens = event.totalInputTokens;
          outputTokens = event.totalOutputTokens;
        }
      }
    } catch {
      text = "Council failed to reach a verdict.";
    }

    return { text, inputTokens, outputTokens };
  }
}
packages/orchestrator/src/council/index.ts
TypeScript

export { CouncilDebate } from "./CouncilDebate.js";
export type { CouncilMember, DebateRound, CouncilResult } from "./CouncilDebate.js";
packages/orchestrator/src/index.ts
TypeScript

export * from "./queue/index.js";
export * from "./worker/index.js";
export * from "./coordinator/index.js";
export * from "./council/index.js";
PART B — @cowork/research
packages/research/package.json
JSON

{
  "name": "@cowork/research",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./planner": "./src/planner/index.ts",
    "./executor": "./src/executor/index.ts",
    "./reporter": "./src/reporter/index.ts",
    "./tools": "./src/tools/index.ts"
  },
  "dependencies": {
    "@cowork/core": "workspace:*",
    "@cowork/wiki": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "latest"
  }
}
packages/research/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" },
    { "path": "../wiki" }
  ]
}
packages/research/src/planner/types.ts
TypeScript

export type ResearchStepKind =
  | "search"
  | "read"
  | "analyze"
  | "synthesize"
  | "verify"
  | "write";

export interface ResearchStep {
  id: string;
  kind: ResearchStepKind;
  description: string;
  prompt: string;
  dependsOn: string[];
  completed: boolean;
  result?: string;
  tokens?: { input: number; output: number };
}

export interface ResearchPlan {
  id: string;
  question: string;
  hypothesis?: string;
  steps: ResearchStep[];
  createdAt: string;
}

export type ResearchStatus =
  | "planned"
  | "in-progress"
  | "complete"
  | "failed"
  | "cancelled";

export interface ResearchSession {
  id: string;
  question: string;
  plan: ResearchPlan;
  status: ResearchStatus;
  findings: ResearchFinding[];
  report?: string;
  startedAt: string;
  completedAt?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface ResearchFinding {
  id: string;
  stepId: string;
  kind: "fact" | "contradiction" | "gap" | "hypothesis" | "conclusion";
  content: string;
  confidence: number;
  source?: string;
}
packages/research/src/planner/ResearchPlanner.ts
TypeScript

import { randomUUID } from "node:crypto";
import { queryLoop } from "@cowork/core";
import type { QueryEngine } from "@cowork/core";
import type { ResearchPlan, ResearchStep, ResearchStepKind } from "./types.js";

const PLANNER_SYSTEM_PROMPT = `You are a research planning expert.
Given a research question, create a structured step-by-step research plan.

Each step should have:
- A kind: search | read | analyze | synthesize | verify | write
- A clear description
- A specific prompt for the agent to execute

Format each step as:
STEP [kind]: <description>
PROMPT: <specific agent prompt for this step>
DEPENDS_ON: <comma-separated step numbers, or "none">
---

Be thorough but efficient. Typical plans have 4-8 steps.`;

export class ResearchPlanner {
  constructor(private engine: QueryEngine) {}

  async plan(question: string): Promise<ResearchPlan> {
    let rawOutput = "";

    try {
      for await (const event of queryLoop(
        `Create a research plan for this question:\n\n${question}`,
        {
          engine: this.engine,
          systemPrompt: PLANNER_SYSTEM_PROMPT,
          tools: [],
          maxTurns: 1,
          maxTokens: 2000,
        }
      )) {
        if (event.type === "text") rawOutput += event.text;
      }
    } catch {
      // Fallback: single-step plan
      return this.fallbackPlan(question);
    }

    const steps = this.parseSteps(rawOutput);

    return {
      id: randomUUID(),
      question,
      steps,
      createdAt: new Date().toISOString(),
    };
  }

  private parseSteps(raw: string): ResearchStep[] {
    const stepBlocks = raw.split("---").filter((b) => b.trim());
    const steps: ResearchStep[] = [];

    for (let i = 0; i < stepBlocks.length; i++) {
      const block = stepBlocks[i]!;
      const kindMatch = block.match(/STEP\s+\[(\w+)\]:\s*(.+?)(?=\nPROMPT:|$)/s);
      const promptMatch = block.match(/PROMPT:\s*(.+?)(?=\nDEPENDS_ON:|---$|$)/s);
      const depsMatch = block.match(/DEPENDS_ON:\s*(.+)/);

      if (!kindMatch || !promptMatch) continue;

      const kind = (kindMatch[1]?.toLowerCase() ?? "analyze") as ResearchStepKind;
      const description = kindMatch[2]?.trim() ?? "";
      const prompt = promptMatch[1]?.trim() ?? "";
      const depsRaw = depsMatch?.[1]?.trim() ?? "none";

      const dependsOn =
        depsRaw === "none"
          ? []
          : depsRaw
              .split(",")
              .map((d) => {
                const num = parseInt(d.trim(), 10) - 1;
                return steps[num]?.id ?? "";
              })
              .filter(Boolean);

      steps.push({
        id: randomUUID(),
        kind,
        description,
        prompt,
        dependsOn,
        completed: false,
      });
    }

    return steps.length > 0 ? steps : this.fallbackPlan("").steps;
  }

  private fallbackPlan(question: string): ResearchPlan {
    return {
      id: randomUUID(),
      question,
      steps: [
        {
          id: randomUUID(),
          kind: "analyze",
          description: "Analyze and answer the research question",
          prompt: question,
          dependsOn: [],
          completed: false,
        },
      ],
      createdAt: new Date().toISOString(),
    };
  }
}
packages/research/src/planner/index.ts
TypeScript

export { ResearchPlanner } from "./ResearchPlanner.js";
export type {
  ResearchPlan,
  ResearchStep,
  ResearchStepKind,
  ResearchFinding,
  ResearchSession,
  ResearchStatus,
} from "./types.js";
packages/research/src/executor/ResearchExecutor.ts
TypeScript

import { randomUUID } from "node:crypto";
import { queryLoop } from "@cowork/core";
import type { QueryEngine, ToolDefinition } from "@cowork/core";
import type {
  ResearchPlan,
  ResearchSession,
  ResearchFinding,
  ResearchStep,
} from "../planner/types.js";

const EXECUTOR_SYSTEM_PROMPT = `You are a research agent executing a specific research step.
Be precise, factual, and thorough. Cite your sources when possible.
If you discover contradictions or gaps in knowledge, explicitly call them out.
End each response with:
CONFIDENCE: <0.0-1.0>
KEY_FINDINGS: <bullet list of 1-3 key findings from this step>`;

export class ResearchExecutor {
  constructor(
    private engine: QueryEngine,
    private tools: ToolDefinition[]
  ) {}

  async executeSession(
    plan: ResearchPlan,
    onStepComplete?: (step: ResearchStep, result: string) => void
  ): Promise<ResearchSession> {
    const session: ResearchSession = {
      id: randomUUID(),
      question: plan.question,
      plan,
      status: "in-progress",
      findings: [],
      startedAt: new Date().toISOString(),
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    // Execute steps in dependency order
    const completed = new Set<string>();

    const executeStep = async (step: ResearchStep): Promise<void> => {
      // Wait for dependencies
      while (step.dependsOn.some((dep) => !completed.has(dep))) {
        await new Promise((r) => setTimeout(r, 100));
      }

      // Build context from completed dependency results
      const depContext = step.dependsOn
        .map((depId) => {
          const depStep = plan.steps.find((s) => s.id === depId);
          return depStep?.result
            ? `## ${depStep.description}\n${depStep.result}`
            : null;
        })
        .filter(Boolean)
        .join("\n\n");

      const prompt = depContext
        ? `Prior research context:\n${depContext}\n\nCurrent step: ${step.prompt}`
        : step.prompt;

      let result = "";
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        for await (const event of queryLoop(prompt, {
          engine: this.engine,
          systemPrompt: EXECUTOR_SYSTEM_PROMPT,
          tools: this.tools,
          maxTurns: 5,
          requestApproval: async () => true,
        })) {
          if (event.type === "text") result += event.text;
          if (event.type === "complete") {
            inputTokens = event.totalInputTokens;
            outputTokens = event.totalOutputTokens;
          }
        }
      } catch (err) {
        result = `Step failed: ${err instanceof Error ? err.message : String(err)}`;
      }

      step.completed = true;
      step.result = result;
      step.tokens = { input: inputTokens, output: outputTokens };
      session.totalInputTokens += inputTokens;
      session.totalOutputTokens += outputTokens;

      // Extract findings
      const findings = this.extractFindings(result, step.id);
      session.findings.push(...findings);

      completed.add(step.id);
      onStepComplete?.(step, result);
    };

    // Execute all steps (respecting dependencies via polling)
    await Promise.all(plan.steps.map((step) => executeStep(step)));

    session.status = "complete";
    session.completedAt = new Date().toISOString();

    return session;
  }

  private extractFindings(result: string, stepId: string): ResearchFinding[] {
    const findings: ResearchFinding[] = [];

    const confMatch = result.match(/CONFIDENCE:\s*([\d.]+)/i);
    const confidence = confMatch ? parseFloat(confMatch[1]!) : 0.7;

    const keyFindingsMatch = result.match(/KEY_FINDINGS:\s*\n?((?:[-•].+\n?)+)/i);
    if (keyFindingsMatch) {
      const bullets = keyFindingsMatch[1]!
        .split("\n")
        .filter((l) => l.trim().match(/^[-•]/))
        .map((l) => l.replace(/^[-•]\s*/, "").trim());

      for (const bullet of bullets) {
        if (bullet) {
          findings.push({
            id: randomUUID(),
            stepId,
            kind: "fact",
            content: bullet,
            confidence,
          });
        }
      }
    }

    return findings;
  }
}
packages/research/src/executor/index.ts
TypeScript

export { ResearchExecutor } from "./ResearchExecutor.js";
packages/research/src/reporter/ResearchReporter.ts
TypeScript

import { queryLoop } from "@cowork/core";
import type { QueryEngine } from "@cowork/core";
import type { ResearchSession } from "../planner/types.js";
import type { WikiStore } from "@cowork/wiki/store";

const REPORTER_SYSTEM_PROMPT = `You are a research report writer.
Synthesize research findings into a clear, well-structured report.
Use markdown. Include: Executive Summary, Key Findings, Analysis, Conclusions, and Limitations.`;

export class ResearchReporter {
  constructor(
    private engine: QueryEngine,
    private wikiStore?: WikiStore
  ) {}

  async generateReport(session: ResearchSession): Promise<string> {
    const stepsText = session.plan.steps
      .filter((s) => s.completed && s.result)
      .map((s) => `### ${s.description}\n${s.result}`)
      .join("\n\n");

    const findingsText = session.findings
      .map((f) => `- [${f.kind}] ${f.content} (confidence: ${f.confidence.toFixed(2)})`)
      .join("\n");

    const prompt = [
      `Research Question: ${session.question}`,
      ``,
      `Research Steps Completed:`,
      stepsText,
      ``,
      `Extracted Findings:`,
      findingsText,
      ``,
      `Write a comprehensive research report synthesizing all of the above.`,
    ].join("\n");

    let report = "";

    try {
      for await (const event of queryLoop(prompt, {
        engine: this.engine,
        systemPrompt: REPORTER_SYSTEM_PROMPT,
        tools: [],
        maxTurns: 1,
        maxTokens: 3000,
      })) {
        if (event.type === "text") report += event.text;
      }
    } catch {
      report = this.fallbackReport(session);
    }

    // Save to wiki if store is available
    if (this.wikiStore && report) {
      const title = `Research: ${session.question.slice(0, 60)}`;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const existing = await this.wikiStore.getBySlug(slug);

      if (existing) {
        await this.wikiStore.update(existing.id, {
          sources: [...existing.sources, report],
          tags: [...new Set([...existing.tags, "research", "auto-generated"])],
        });
      } else {
        await this.wikiStore.create({
          title,
          sources: [report],
          body: report,
          tags: ["research", "auto-generated"],
          confidence: this.avgConfidence(session),
        });
      }
    }

    return report;
  }

  formatSummary(session: ResearchSession): string {
    const lines = [
      `## Research Summary`,
      `**Question:** ${session.question}`,
      `**Status:** ${session.status}`,
      `**Steps:** ${session.plan.steps.filter((s) => s.completed).length}/${session.plan.steps.length}`,
      `**Findings:** ${session.findings.length}`,
      `**Tokens:** ${session.totalInputTokens + session.totalOutputTokens}`,
      ``,
      `### Key Findings`,
      ...session.findings
        .filter((f) => f.confidence > 0.6)
        .slice(0, 10)
        .map((f) => `- ${f.content}`),
    ];
    return lines.join("\n");
  }

  private fallbackReport(session: ResearchSession): string {
    return [
      `# Research Report: ${session.question}`,
      ``,
      `## Findings`,
      ...session.findings.map((f) => `- ${f.content}`),
    ].join("\n");
  }

  private avgConfidence(session: ResearchSession): number {
    if (session.findings.length === 0) return 0.5;
    return (
      session.findings.reduce((s, f) => s + f.confidence, 0) /
      session.findings.length
    );
  }
}
packages/research/src/reporter/index.ts
TypeScript

export { ResearchReporter } from "./ResearchReporter.js";
packages/research/src/tools/ResearchTools.ts
TypeScript

import { PermissionLevel } from "@cowork/core";
import type { ToolDefinition } from "@cowork/core/tools";
import type { ResearchPlanner } from "../planner/ResearchPlanner.js";
import type { ResearchExecutor } from "../executor/ResearchExecutor.js";
import type { ResearchReporter } from "../reporter/ResearchReporter.js";

export function makeResearchTools(
  planner: ResearchPlanner,
  executor: ResearchExecutor,
  reporter: ResearchReporter
): ToolDefinition[] {
  return [
    {
      name: "research",
      description:
        "Run a full AutoResearch loop: plan → execute → report. " +
        "Best for complex multi-step questions that require structured investigation.",
      permissionLevel: PermissionLevel.STANDARD,
      requiresApproval: false,
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The research question to investigate.",
          },
          save_to_wiki: {
            type: "boolean",
            description: "If true, save the report to the project wiki.",
          },
        },
        required: ["question"],
      },
      async execute(input: { question: string; save_to_wiki?: boolean }) {
        try {
          process.stderr.write(`[research] Planning: ${input.question.slice(0, 60)}\n`);
          const plan = await planner.plan(input.question);

          process.stderr.write(`[research] Executing ${plan.steps.length} steps...\n`);
          const session = await executor.executeSession(plan, (step, _result) => {
            process.stderr.write(`[research] ✓ ${step.description}\n`);
          });

          process.stderr.write(`[research] Generating report...\n`);
          const report = await reporter.generateReport(session);

          return {
            content: [
              reporter.formatSummary(session),
              ``,
              `## Full Report`,
              report,
            ].join("\n"),
            isError: false,
          };
        } catch (err) {
          return {
            content: `Research failed: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          };
        }
      },
    },

    {
      name: "research_plan",
      description: "Generate a research plan without executing it. Useful for reviewing the approach before committing.",
      permissionLevel: PermissionLevel.READ_ONLY,
      inputSchema: {
        type: "object",
        properties: {
          question: { type: "string", description: "The research question." },
        },
        required: ["question"],
      },
      async execute(input: { question: string }) {
        try {
          const plan = await planner.plan(input.question);
          const lines = [
            `Research plan for: "${input.question}"`,
            `Steps: ${plan.steps.length}`,
            ``,
            ...plan.steps.map(
              (s, i) =>
                `${i + 1}. [${s.kind}] ${s.description}${s.dependsOn.length ? ` (depends on: ${s.dependsOn.length} prior steps)` : ""}`
            ),
          ];
          return { content: lines.join("\n"), isError: false };
        } catch (err) {
          return {
            content: `Planning failed: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          };
        }
      },
    },
  ];
}
packages/research/src/tools/index.ts
TypeScript

export { makeResearchTools } from "./ResearchTools.js";
packages/research/src/index.ts
TypeScript

export * from "./planner/index.js";
export * from "./executor/index.js";
export * from "./reporter/index.js";
export * from "./tools/index.js";
PART C — @cowork/mirofish (Simulation Studio)
packages/mirofish/package.json
JSON

{
  "name": "@cowork/mirofish",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./simulation": "./src/simulation/index.ts",
    "./agents": "./src/agents/index.ts",
    "./tools": "./src/tools/index.ts"
  },
  "dependencies": {
    "@cowork/core": "workspace:*",
    "@cowork/wiki": "workspace:*",
    "@cowork/analytics": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "latest"
  }
}
packages/mirofish/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" },
    { "path": "../wiki" },
    { "path": "../analytics" }
  ]
}
packages/mirofish/src/agents/SimAgent.ts
TypeScript

import { randomUUID } from "node:crypto";
import { queryLoop } from "@cowork/core";
import type { QueryEngine, ToolDefinition } from "@cowork/core";

export interface SimAgentConfig {
  id?: string;
  name: string;
  role: string;
  systemPrompt: string;
  engine: QueryEngine;
  tools?: ToolDefinition[];
}

export interface SimAgentMessage {
  agentId: string;
  agentName: string;
  round: number;
  content: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export class SimAgent {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  private systemPrompt: string;
  private engine: QueryEngine;
  private tools: ToolDefinition[];
  private memory: SimAgentMessage[] = [];

  constructor(config: SimAgentConfig) {
    this.id = config.id ?? randomUUID();
    this.name = config.name;
    this.role = config.role;
    this.systemPrompt = config.systemPrompt;
    this.engine = config.engine;
    this.tools = config.tools ?? [];
  }

  async respond(
    scenario: string,
    round: number,
    priorMessages: SimAgentMessage[]
  ): Promise<SimAgentMessage> {
    const start = Date.now();

    const priorContext =
      priorMessages.length > 0
        ? `\n\nPrevious round messages:\n${priorMessages
            .map((m) => `**${m.agentName} (${m.round}):** ${m.content}`)
            .join("\n\n")}`
        : "";

    const prompt = [
      `Simulation scenario: ${scenario}`,
      priorContext,
      ``,
      `Round ${round} — as ${this.name} (${this.role}), what is your response/action?`,
      `Be specific and in-character. Keep your response under 200 words.`,
    ].join("\n");

    let content = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const event of queryLoop(prompt, {
        engine: this.engine,
        systemPrompt: this.systemPrompt,
        tools: this.tools,
        maxTurns: 2,
        requestApproval: async () => true,
        maxTokens: 500,
      })) {
        if (event.type === "text") content += event.text;
        if (event.type === "complete") {
          inputTokens = event.totalInputTokens;
          outputTokens = event.totalOutputTokens;
        }
      }
    } catch (err) {
      content = `[${this.name} failed to respond: ${err instanceof Error ? err.message : String(err)}]`;
    }

    const message: SimAgentMessage = {
      agentId: this.id,
      agentName: this.name,
      round,
      content,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
    };

    this.memory.push(message);
    return message;
  }

  getMemory(): SimAgentMessage[] {
    return [...this.memory];
  }

  clearMemory(): void {
    this.memory = [];
  }
}
packages/mirofish/src/agents/index.ts
TypeScript

export { SimAgent } from "./SimAgent.js";
export type { SimAgentConfig, SimAgentMessage } from "./SimAgent.js";
packages/mirofish/src/simulation/types.ts
TypeScript

import type { SimAgentMessage } from "../agents/SimAgent.js";

export interface SimulationConfig {
  name: string;
  scenario: string;
  agents: Array<{
    name: string;
    role: string;
    systemPrompt: string;
  }>;
  rounds: number;
  concurrency?: number;
  saveToWiki?: boolean;
  saveToMemory?: boolean;
}

export interface RoundResult {
  round: number;
  messages: SimAgentMessage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
}

export interface SimulationResult {
  id: string;
  config: SimulationConfig;
  rounds: RoundResult[];
  summary?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  completedAt: string;
}
packages/mirofish/src/simulation/SimulationRunner.ts
TypeScript

import { randomUUID } from "node:crypto";
import { queryLoop } from "@cowork/core";
import type { QueryEngine, ToolDefinition } from "@cowork/core";
import { SimAgent } from "../agents/SimAgent.js";
import type {
  SimulationConfig,
  SimulationResult,
  RoundResult,
} from "./types.js";
import type { WikiStore } from "@cowork/wiki/store";

export class SimulationRunner {
  constructor(
    private engine: QueryEngine,
    private tools: ToolDefinition[],
    private wikiStore?: WikiStore
  ) {}

  async run(
    config: SimulationConfig,
    onRoundComplete?: (round: RoundResult) => void
  ): Promise<SimulationResult> {
    const startTime = Date.now();
    const id = randomUUID();

    // Instantiate agents
    const agents = config.agents.map(
      (a) =>
        new SimAgent({
          name: a.name,
          role: a.role,
          systemPrompt: a.systemPrompt,
          engine: this.engine,
          tools: this.tools,
        })
    );

    const allRounds: RoundResult[] = [];
    const allMessages: typeof agents[0] extends SimAgent ? ReturnType<typeof agents[0]["getMemory"]> : never[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let round = 1; round <= config.rounds; round++) {
      const roundStart = Date.now();
      const priorMessages = allRounds.flatMap((r) => r.messages);

      // Run agents with configured concurrency
      const concurrency = config.concurrency ?? agents.length;
      const roundMessages = await this.runConcurrent(
        agents,
        config.scenario,
        round,
        priorMessages,
        concurrency
      );

      const roundTokensIn = roundMessages.reduce((s, m) => s + m.inputTokens, 0);
      const roundTokensOut = roundMessages.reduce((s, m) => s + m.outputTokens, 0);
      totalInputTokens += roundTokensIn;
      totalOutputTokens += roundTokensOut;

      const roundResult: RoundResult = {
        round,
        messages: roundMessages,
        totalInputTokens: roundTokensIn,
        totalOutputTokens: roundTokensOut,
        durationMs: Date.now() - roundStart,
      };

      allRounds.push(roundResult);
      onRoundComplete?.(roundResult);
    }

    // Generate simulation summary
    const summary = await this.summarize(config, allRounds);
    totalInputTokens += summary.inputTokens;
    totalOutputTokens += summary.outputTokens;

    const result: SimulationResult = {
      id,
      config,
      rounds: allRounds,
      summary: summary.text,
      totalInputTokens,
      totalOutputTokens,
      totalDurationMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    };

    // Save to wiki if configured
    if (config.saveToWiki && this.wikiStore && summary.text) {
      await this.wikiStore.create({
        title: `Simulation: ${config.name}`,
        sources: [summary.text],
        body: summary.text,
        tags: ["simulation", "mirofish", "auto-generated"],
      });
    }

    return result;
  }

  private async runConcurrent(
    agents: SimAgent[],
    scenario: string,
    round: number,
    priorMessages: ReturnType<SimAgent["getMemory"]>,
    concurrency: number
  ) {
    const results = [];
    for (let i = 0; i < agents.length; i += concurrency) {
      const chunk = agents.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map((a) => a.respond(scenario, round, priorMessages))
      );
      results.push(...chunkResults);
    }
    return results;
  }

  private async summarize(
    config: SimulationConfig,
    rounds: RoundResult[]
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const transcript = rounds
      .flatMap((r) =>
        r.messages.map(
          (m) => `[Round ${r.round}] ${m.agentName}: ${m.content}`
        )
      )
      .join("\n\n");

    const prompt = [
      `Simulation: "${config.name}"`,
      `Scenario: ${config.scenario}`,
      `Agents: ${config.agents.map((a) => `${a.name} (${a.role})`).join(", ")}`,
      `Rounds: ${config.rounds}`,
      ``,
      `Transcript:`,
      transcript.slice(0, 15_000),
      ``,
      `Write a structured simulation summary including: key dynamics, emergent behaviors, notable exchanges, and conclusions.`,
    ].join("\n");

    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const event of queryLoop(prompt, {
        engine: this.engine,
        systemPrompt: "You are a simulation analyst producing insightful summaries of multi-agent interactions.",
        tools: [],
        maxTurns: 1,
        maxTokens: 1500,
      })) {
        if (event.type === "text") text += event.text;
        if (event.type === "complete") {
          inputTokens = event.totalInputTokens;
          outputTokens = event.totalOutputTokens;
        }
      }
    } catch {
      text = `Simulation "${config.name}" completed with ${rounds.length} rounds and ${rounds.flatMap((r) => r.messages).length} total messages.`;
    }

    return { text, inputTokens, outputTokens };
  }
}
packages/mirofish/src/simulation/index.ts
TypeScript

export { SimulationRunner } from "./SimulationRunner.js";
export type {
  SimulationConfig,
  SimulationResult,
  RoundResult,
} from "./types.js";
packages/mirofish/src/tools/SimulationTools.ts
TypeScript

import { PermissionLevel } from "@cowork/core";
import type { ToolDefinition } from "@cowork/core/tools";
import type { SimulationRunner } from "../simulation/SimulationRunner.js";

export function makeSimulationTools(runner: SimulationRunner): ToolDefinition[] {
  return [
    {
      name: "simulate",
      description:
        "Run a MiroFish multi-agent simulation. Define a scenario and agents, " +
        "then watch them interact across multiple rounds.",
      permissionLevel: PermissionLevel.STANDARD,
      requiresApproval: false,
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Simulation name." },
          scenario: { type: "string", description: "The scenario/situation to simulate." },
          agents: {
            type: "array",
            description: "List of agents participating in the simulation.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                system_prompt: { type: "string" },
              },
              required: ["name", "role", "system_prompt"],
            },
          },
          rounds: {
            type: "number",
            description: "Number of simulation rounds (default: 3, max: 10).",
          },
          save_to_wiki: {
            type: "boolean",
            description: "Save simulation summary to wiki.",
          },
        },
        required: ["name", "scenario", "agents"],
      },
      async execute(input: {
        name: string;
        scenario: string;
        agents: Array<{ name: string; role: string; system_prompt: string }>;
        rounds?: number;
        save_to_wiki?: boolean;
      }) {
        const rounds = Math.min(input.rounds ?? 3, 10);
        let roundCount = 0;

        process.stderr.write(
          `[mirofish] Starting simulation "${input.name}" (${input.agents.length} agents, ${rounds} rounds)\n`
        );

        try {
          const result = await runner.run(
            {
              name: input.name,
              scenario: input.scenario,
              agents: input.agents.map((a) => ({
                name: a.name,
                role: a.role,
                systemPrompt: a.system_prompt,
              })),
              rounds,
              saveToWiki: input.save_to_wiki ?? false,
            },
            (round) => {
              roundCount++;
              process.stderr.write(
                `[mirofish] Round ${round.round}/${rounds} complete (${round.messages.length} messages)\n`
              );
            }
          );

          const lines = [
            `## Simulation: "${result.config.name}" — Complete`,
            `Rounds: ${result.rounds.length}  Agents: ${result.config.agents.length}`,
            `Total tokens: ${result.totalInputTokens + result.totalOutputTokens}`,
            `Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`,
            ``,
            `## Summary`,
            result.summary ?? "No summary generated.",
          ];

          return { content: lines.join("\n"), isError: false };
        } catch (err) {
          return {
            content: `Simulation failed: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          };
        }
      },
    },
  ];
}
packages/mirofish/src/tools/index.ts
TypeScript

export { makeSimulationTools } from "./SimulationTools.js";
packages/mirofish/src/index.ts
TypeScript

export * from "./agents/index.js";
export * from "./simulation/index.js";
export * from "./tools/index.js";
PART D — @cowork/openclaw (Messaging Gateway)
packages/openclaw/package.json
JSON

{
  "name": "@cowork/openclaw",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./gateway": "./src/gateway/index.ts",
    "./telegram": "./src/telegram/index.ts"
  },
  "dependencies": {
    "@cowork/core": "workspace:*",
    "@cowork/security": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "latest"
  }
}
packages/openclaw/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" },
    { "path": "../security" }
  ]
}
packages/openclaw/src/gateway/types.ts
TypeScript

export type MessageChannel = "telegram" | "http" | "websocket";
export type MessageStatus = "queued" | "processing" | "complete" | "error";

export interface InboundMessage {
  id: string;
  channel: MessageChannel;
  from: string;
  text: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface OutboundMessage {
  id: string;
  inboundId: string;
  channel: MessageChannel;
  to: string;
  text: string;
  status: MessageStatus;
  timestamp: string;
}

export interface GatewayConfig {
  port: number;
  /** Rate limit: max requests per minute per sender */
  rateLimitPerMinute: number;
  /** Optional auth token for HTTP gateway */
  authToken?: string;
  /** Allowed sender IDs (empty = allow all) */
  allowedSenders?: string[];
}

export type MessageHandler = (
  message: InboundMessage
) => Promise<string>;
packages/openclaw/src/gateway/RateLimiter.ts
TypeScript

export class RateLimiter {
  private windows = new Map<string, number[]>();

  constructor(private maxPerMinute: number) {}

  isAllowed(senderId: string): boolean {
    const now = Date.now();
    const windowStart = now - 60_000;

    const timestamps = (this.windows.get(senderId) ?? []).filter(
      (t) => t > windowStart
    );

    if (timestamps.length >= this.maxPerMinute) {
      this.windows.set(senderId, timestamps);
      return false;
    }

    timestamps.push(now);
    this.windows.set(senderId, timestamps);
    return true;
  }

  getRemainingCapacity(senderId: string): number {
    const now = Date.now();
    const windowStart = now - 60_000;
    const count = (this.windows.get(senderId) ?? []).filter(
      (t) => t > windowStart
    ).length;
    return Math.max(0, this.maxPerMinute - count);
  }
}
packages/openclaw/src/gateway/GatewayServer.ts
TypeScript

import { randomUUID } from "node:crypto";
import { RateLimiter } from "./RateLimiter.js";
import { scrubSecrets } from "@cowork/security/scrub";
import type {
  GatewayConfig,
  InboundMessage,
  OutboundMessage,
  MessageHandler,
} from "./types.js";

export class GatewayServer {
  private rateLimiter: RateLimiter;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private handler: MessageHandler | null = null;
  private outbox: OutboundMessage[] = [];

  constructor(private config: GatewayConfig) {
    this.rateLimiter = new RateLimiter(config.rateLimitPerMinute);
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  start(): void {
    const self = this;

    this.server = Bun.serve({
      port: this.config.port,

      async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);

        // Auth check
        if (self.config.authToken) {
          const auth = req.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (token !== self.config.authToken) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        if (req.method === "POST" && url.pathname === "/message") {
          return self.handleMessageRequest(req);
        }

        if (req.method === "GET" && url.pathname === "/health") {
          return new Response(
            JSON.stringify({ status: "ok", port: self.config.port }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        if (req.method === "GET" && url.pathname === "/outbox") {
          return new Response(JSON.stringify(self.outbox.slice(-50)), {
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    process.stderr.write(
      `[openclaw] Gateway server listening on port ${this.config.port}\n`
    );
  }

  stop(): void {
    this.server?.stop();
    this.server = null;
  }

  private async handleMessageRequest(req: Request): Promise<Response> {
    let body: { from?: string; text?: string; metadata?: Record<string, unknown> };

    try {
      body = (await req.json()) as typeof body;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const from = body.from ?? "anonymous";
    const text = body.text ?? "";

    if (!text.trim()) {
      return new Response(JSON.stringify({ error: "Empty message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Rate limit
    if (!this.rateLimiter.isAllowed(from)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Sender allowlist
    if (
      this.config.allowedSenders &&
      this.config.allowedSenders.length > 0 &&
      !this.config.allowedSenders.includes(from)
    ) {
      return new Response(JSON.stringify({ error: "Sender not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const inbound: InboundMessage = {
      id: randomUUID(),
      channel: "http",
      from,
      text: scrubSecrets(text),
      timestamp: new Date().toISOString(),
      metadata: body.metadata,
    };

    const outbound: OutboundMessage = {
      id: randomUUID(),
      inboundId: inbound.id,
      channel: "http",
      to: from,
      text: "",
      status: "processing",
      timestamp: new Date().toISOString(),
    };

    this.outbox.push(outbound);

    try {
      const responseText = this.handler
        ? await this.handler(inbound)
        : "No handler registered.";

      outbound.text = responseText;
      outbound.status = "complete";

      return new Response(
        JSON.stringify({ id: outbound.id, response: responseText }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (err) {
      outbound.status = "error";
      outbound.text = err instanceof Error ? err.message : String(err);

      return new Response(
        JSON.stringify({ error: "Handler failed", id: outbound.id }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }
}
packages/openclaw/src/gateway/index.ts
TypeScript

export { GatewayServer } from "./GatewayServer.js";
export { RateLimiter } from "./RateLimiter.js";
export type {
  GatewayConfig,
  InboundMessage,
  OutboundMessage,
  MessageChannel,
  MessageStatus,
  MessageHandler,
} from "./types.js";
packages/openclaw/src/telegram/TelegramBot.ts
TypeScript

import { randomUUID } from "node:crypto";
import type { InboundMessage, MessageHandler } from "../gateway/types.js";
import { RateLimiter } from "../gateway/RateLimiter.js";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string; first_name?: string };
    chat: { id: number };
    text?: string;
    date: number;
  };
}

interface TelegramBotConfig {
  token: string;
  rateLimitPerMinute?: number;
  allowedChatIds?: number[];
  pollingIntervalMs?: number;
}

export class TelegramBot {
  private rateLimiter: RateLimiter;
  private handler: MessageHandler | null = null;
  private lastUpdateId = 0;
  private polling = false;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private apiBase: string;

  constructor(private config: TelegramBotConfig) {
    this.apiBase = `https://api.telegram.org/bot${config.token}`;
    this.rateLimiter = new RateLimiter(config.rateLimitPerMinute ?? 10);
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    this.pollingTimer = setInterval(
      () => void this.poll(),
      this.config.pollingIntervalMs ?? 2000
    );
    process.stderr.write(`[openclaw/telegram] Polling started.\n`);
  }

  stopPolling(): void {
    this.polling = false;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    const chunks = this.chunkMessage(text, 4096);
    for (const chunk of chunks) {
      try {
        await fetch(`${this.apiBase}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: "Markdown" }),
        });
      } catch {
        // ignore send failures — non-critical
      }
    }
  }

  private async poll(): Promise<void> {
    try {
      const resp = await fetch(
        `${this.apiBase}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=1`
      );
      if (!resp.ok) return;

      const data = (await resp.json()) as { ok: boolean; result: TelegramUpdate[] };
      if (!data.ok || !data.result.length) return;

      for (const update of data.result) {
        this.lastUpdateId = update.update_id;
        if (update.message) await this.handleUpdate(update.message);
      }
    } catch {
      // network failure — retry next poll
    }
  }

  private async handleUpdate(
    msg: NonNullable<TelegramUpdate["message"]>
  ): Promise<void> {
    const chatId = msg.chat.id;
    const from = String(msg.from?.id ?? chatId);
    const text = msg.text ?? "";

    if (!text.trim()) return;

    // Allowlist check
    if (
      this.config.allowedChatIds &&
      this.config.allowedChatIds.length > 0 &&
      !this.config.allowedChatIds.includes(chatId)
    ) {
      await this.sendMessage(chatId, "You are not authorized to use this bot.");
      return;
    }

    // Rate limit
    if (!this.rateLimiter.isAllowed(from)) {
      await this.sendMessage(chatId, "Rate limit exceeded. Please wait a minute.");
      return;
    }

    const inbound: InboundMessage = {
      id: randomUUID(),
      channel: "telegram",
      from,
      text,
      timestamp: new Date(msg.date * 1000).toISOString(),
      metadata: { chatId, username: msg.from?.username, firstName: msg.from?.first_name },
    };

    if (this.handler) {
      try {
        const response = await this.handler(inbound);
        await this.sendMessage(chatId, response);
      } catch (err) {
        await this.sendMessage(
          chatId,
          `Error: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }
  }

  private chunkMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxLen) {
      chunks.push(text.slice(i, i + maxLen));
    }
    return chunks;
  }
}
packages/openclaw/src/telegram/index.ts
TypeScript

export { TelegramBot } from "./TelegramBot.js";
packages/openclaw/src/index.ts
TypeScript

export * from "./gateway/index.js";
export * from "./telegram/index.js";
PART E — @cowork/hermes (MCP Server Host)
packages/hermes/package.json
JSON

{
  "name": "@cowork/hermes",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./server": "./src/server/index.ts",
    "./transport": "./src/transport/index.ts"
  },
  "dependencies": {
    "@cowork/core": "workspace:*",
    "@cowork/security": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "latest"
  }
}
packages/hermes/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" },
    { "path": "../security" }
  ]
}
packages/hermes/src/server/types.ts
TypeScript

export interface HermesConfig {
  transport: "stdio" | "sse";
  port?: number;
  authToken?: string;
  /** If non-empty, only these tool names are exposed */
  toolAllowlist?: string[];
  serverName?: string;
  serverVersion?: string;
}

export interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface McpJsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
packages/hermes/src/server/HermesServer.ts
TypeScript

import type { ToolDefinition } from "@cowork/core/tools";
import type {
  HermesConfig,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
} from "./types.js";

/**
 * HermesServer exposes locoworker tools as an MCP server.
 *
 * Transport: stdio (reads from stdin, writes to stdout as NDJSON)
 * Future: SSE transport (HTTP server with /sse endpoint) - Phase 8
 */
export class HermesServer {
  private tools: Map<string, ToolDefinition>;
  private config: HermesConfig;
  private running = false;

  constructor(config: HermesConfig, tools: ToolDefinition[]) {
    this.config = config;

    const allowlist = new Set(config.toolAllowlist ?? []);
    const filtered =
      allowlist.size > 0 ? tools.filter((t) => allowlist.has(t.name)) : tools;

    this.tools = new Map(filtered.map((t) => [t.name, t]));
  }

  async startStdio(): Promise<void> {
    if (this.running) return;
    this.running = true;

    process.stderr.write(
      `[hermes] MCP server started (stdio, ${this.tools.size} tools exposed)\n`
    );

    let buffer = "";

    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        void this.handleLine(line);
      }
    });

    process.stdin.on("end", () => {
      this.running = false;
    });

    // Keep process alive
    await new Promise<void>((resolve) => {
      process.stdin.once("end", resolve);
    });
  }

  startSse(): void {
    if (!this.config.port) {
      throw new Error("[hermes] SSE transport requires a port.");
    }

    const self = this;

    Bun.serve({
      port: this.config.port,
      async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);

        // Auth check
        if (self.config.authToken) {
          const auth = req.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (token !== self.config.authToken) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        if (url.pathname === "/sse") {
          return self.handleSse(req);
        }

        if (req.method === "POST" && url.pathname === "/message") {
          return self.handleHttpMessage(req);
        }

        if (url.pathname === "/health") {
          return new Response(
            JSON.stringify({ ok: true, tools: [...self.tools.keys()] }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    process.stderr.write(
      `[hermes] MCP server started (SSE, port ${this.config.port}, ${this.tools.size} tools exposed)\n`
    );
  }

  private async handleLine(line: string): Promise<void> {
    try {
      const req = JSON.parse(line) as McpJsonRpcRequest;
      const response = await this.dispatch(req);
      process.stdout.write(JSON.stringify(response) + "\n");
    } catch (err) {
      const errResponse: McpJsonRpcResponse = {
        jsonrpc: "2.0",
        id: 0,
        error: {
          code: -32700,
          message: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
      process.stdout.write(JSON.stringify(errResponse) + "\n");
    }
  }

  private async handleHttpMessage(req: Request): Promise<Response> {
    try {
      const body = (await req.json()) as McpJsonRpcRequest;
      const response = await this.dispatch(body);
      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 0,
          error: { code: -32700, message: "Parse error" },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  private handleSse(_req: Request): Response {
    // Minimal SSE: clients connect and receive a "ready" event
    // Full bidirectional SSE is Phase 8
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue("data: {\"type\":\"ready\"}\n\n");
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  private async dispatch(
    req: McpJsonRpcRequest
  ): Promise<McpJsonRpcResponse> {
    const respond = (result: unknown): McpJsonRpcResponse => ({
      jsonrpc: "2.0",
      id: req.id,
      result,
    });

    const respondError = (code: number, message: string): McpJsonRpcResponse => ({
      jsonrpc: "2.0",
      id: req.id,
      error: { code, message },
    });

    switch (req.method) {
      case "initialize":
        return respond({
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: this.config.serverName ?? "locoworker-hermes",
            version: this.config.serverVersion ?? "0.1.0",
          },
        });

      case "tools/list":
        return respond({
          tools: [...this.tools.values()].map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });

      case "tools/call": {
        const params = req.params as {
          name: string;
          arguments?: unknown;
        } | undefined;

        if (!params?.name) {
          return respondError(-32602, "Missing tool name");
        }

        const tool = this.tools.get(params.name);
        if (!tool) {
          return respondError(-32602, `Unknown tool: ${params.name}`);
        }

        try {
          const result = await tool.execute(params.arguments ?? {}, {
            workingDirectory: process.cwd(),
            sessionId: "hermes",
            permissionLevel: 3, // ELEVATED
          } as Parameters<typeof tool.execute>[1]);

          return respond({
            content: [{ type: "text", text: result.content }],
            isError: result.isError,
          });
        } catch (err) {
          return respond({
            content: [
              {
                type: "text",
                text: err instanceof Error ? err.message : String(err),
              },
            ],
            isError: true,
          });
        }
      }

      case "shutdown":
        return respond({});

      default:
        return respondError(-32601, `Method not found: ${req.method}`);
    }
  }
}
packages/hermes/src/server/index.ts
TypeScript

export { HermesServer } from "./HermesServer.js";
export type { HermesConfig } from "./types.js";
packages/hermes/src/transport/index.ts
TypeScript

// Transport adapters live here in Phase 8 (WebSocket, full SSE with message queuing)
export {};
packages/hermes/src/index.ts
TypeScript

export * from "./server/index.js";
export * from "./transport/index.js";
PART F — Kairos: standalone daemon process
apps/kairos-daemon/package.json
JSON

{
  "name": "@cowork/kairos-daemon",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "kairos": "./src/index.ts"
  },
  "dependencies": {
    "@cowork/core": "workspace:*",
    "@cowork/kairos": "workspace:*",
    "@cowork/telemetry": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "latest"
  }
}
apps/kairos-daemon/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/core" },
    { "path": "../../packages/kairos" },
    { "path": "../../packages/telemetry" }
  ]
}
apps/kairos-daemon/src/ipc.ts
TypeScript

/**
 * IPC protocol between the CLI and the kairos daemon.
 * Uses a local Unix socket at ~/.cowork/kairos/daemon.sock.
 */
export type IpcMessageKind =
  | "ping"
  | "schedule"
  | "cancel"
  | "list"
  | "status"
  | "shutdown";

export interface IpcMessage {
  kind: IpcMessageKind;
  id: string;
  payload?: unknown;
}

export interface IpcResponse {
  ok: boolean;
  id: string;
  data?: unknown;
  error?: string;
}

export const DAEMON_SOCK_PATH = `${process.env["HOME"] ?? "/tmp"}/.cowork/kairos/daemon.sock`;
export const DAEMON_PID_PATH = `${process.env["HOME"] ?? "/tmp"}/.cowork/kairos/daemon.pid`;
apps/kairos-daemon/src/index.ts
TypeScript

#!/usr/bin/env bun
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { KairosDaemon } from "@cowork/kairos/daemon";
import { resolveProvider, QueryEngine, resolveSettings } from "@cowork/core";
import type { IpcMessage, IpcResponse } from "./ipc.js";
import { DAEMON_SOCK_PATH, DAEMON_PID_PATH } from "./ipc.js";

async function main() {
  const cwd = process.cwd();
  const settings = resolveSettings(cwd, process.env, {});

  // Write PID file
  await mkdir(join(homedir(), ".cowork", "kairos"), { recursive: true });
  await writeFile(DAEMON_PID_PATH, String(process.pid), "utf-8");

  process.stderr.write(`[kairos-daemon] Starting (pid ${process.pid})...\n`);

  const provider = resolveProvider({
    provider: settings.provider,
    model: settings.model,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
  }, process.env);

  const engine = new QueryEngine(provider);

  const daemon = new KairosDaemon({
    projectRoot: cwd,
    enableFileWatch: process.env["COWORK_KAIROS_FILE_WATCH"] === "true",
    onTaskPrompt: async (prompt, task) => {
      process.stderr.write(`[kairos-daemon] Firing task "${task.name}"\n`);
      // Run the prompt through the agent engine (headless, no tools for safety)
      const { queryLoop } = await import("@cowork/core");
      let output = "";
      for await (const event of queryLoop(prompt, {
        engine,
        systemPrompt: "You are an autonomous background agent. Complete the task concisely.",
        tools: [],
        maxTurns: 5,
        requestApproval: async () => false,
      })) {
        if (event.type === "text") output += event.text;
      }
      process.stderr.write(`[kairos-daemon] Task "${task.name}" output: ${output.slice(0, 100)}\n`);
    },
  });

  await daemon.start();

  // Start IPC server using Bun's built-in TCP listener
  const server = Bun.listen<{ buffer: string }>({
    unix: DAEMON_SOCK_PATH,
    socket: {
      open(socket) {
        socket.data = { buffer: "" };
      },
      data(socket, data) {
        socket.data.buffer += data.toString();
        const lines = socket.data.buffer.split("\n");
        socket.data.buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          void (async () => {
            try {
              const msg = JSON.parse(line) as IpcMessage;
              const response = await handleIpc(msg, daemon);
              socket.write(JSON.stringify(response) + "\n");
            } catch (err) {
              const errResp: IpcResponse = {
                ok: false,
                id: "unknown",
                error: err instanceof Error ? err.message : String(err),
              };
              socket.write(JSON.stringify(errResp) + "\n");
            }
          })();
        }
      },
      error(socket, error) {
        process.stderr.write(`[kairos-daemon] Socket error: ${error.message}\n`);
      },
    },
  });

  process.stderr.write(`[kairos-daemon] IPC listening on ${DAEMON_SOCK_PATH}\n`);

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    process.stderr.write(`[kairos-daemon] SIGTERM received. Shutting down.\n`);
    await daemon.stop();
    server.stop();
    if (existsSync(DAEMON_PID_PATH)) await unlink(DAEMON_PID_PATH);
    if (existsSync(DAEMON_SOCK_PATH)) await unlink(DAEMON_SOCK_PATH);
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    await daemon.stop();
    server.stop();
    if (existsSync(DAEMON_PID_PATH)) await unlink(DAEMON_PID_PATH);
    if (existsSync(DAEMON_SOCK_PATH)) await unlink(DAEMON_SOCK_PATH);
    process.exit(0);
  });
}

async function handleIpc(
  msg: IpcMessage,
  daemon: KairosDaemon
): Promise<IpcResponse> {
  switch (msg.kind) {
    case "ping":
      return { ok: true, id: msg.id, data: { pong: true, pid: process.pid } };

    case "list":
      return {
        ok: true,
        id: msg.id,
        data: daemon.scheduler.list(),
      };

    case "schedule": {
      const opts = msg.payload as Parameters<typeof daemon.scheduler.schedule>[0];
      const task = await daemon.scheduler.schedule(opts);
      return { ok: true, id: msg.id, data: task };
    }

    case "cancel": {
      const { taskId } = msg.payload as { taskId: string };
      const cancelled = await daemon.scheduler.cancel(taskId);
      return { ok: true, id: msg.id, data: { cancelled } };
    }

    case "status":
      return {
        ok: true,
        id: msg.id,
        data: {
          running: daemon.isRunning(),
          tasks: daemon.scheduler.list().length,
          pid: process.pid,
        },
      };

    case "shutdown":
      await daemon.stop();
      process.exit(0);
      return { ok: true, id: msg.id }; // unreachable but satisfies TS

    default:
      return { ok: false, id: msg.id, error: `Unknown message kind` };
  }
}

main().catch((err) => {
  process.stderr.write(`[kairos-daemon] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
packages/kairos/src/client/KairosClient.ts
TypeScript

/**
 * IPC client for talking to a running kairos-daemon process.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { DAEMON_SOCK_PATH } from "../../../apps/kairos-daemon/src/ipc.js";
import type { IpcMessage, IpcResponse, IpcMessageKind } from "../../../apps/kairos-daemon/src/ipc.js";
import type { ScheduledTask } from "../scheduler/types.js";

export class KairosClient {
  private socket: Awaited<ReturnType<typeof Bun.connect>> | null = null;
  private pending = new Map<string, {
    resolve: (v: IpcResponse) => void;
    reject: (e: Error) => void;
  }>();
  private buffer = "";

  isDaemonRunning(): boolean {
    return existsSync(DAEMON_SOCK_PATH);
  }

  async connect(): Promise<void> {
    if (!this.isDaemonRunning()) {
      throw new Error(
        "Kairos daemon is not running. Start it with: bun run apps/kairos-daemon/src/index.ts"
      );
    }

    const self = this;

    this.socket = await Bun.connect({
      unix: DAEMON_SOCK_PATH,
      socket: {
        data(_socket, data) {
          self.buffer += data.toString();
          const lines = self.buffer.split("\n");
          self.buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const resp = JSON.parse(line) as IpcResponse;
              const pending = self.pending.get(resp.id);
              if (pending) {
                self.pending.delete(resp.id);
                if (resp.ok) pending.resolve(resp);
                else pending.reject(new Error(resp.error ?? "IPC error"));
              }
            } catch {
              // malformed line
            }
          }
        },
        error(_socket, err) {
          for (const { reject } of self.pending.values()) reject(err);
          self.pending.clear();
        },
      },
    });
  }

  async disconnect(): Promise<void> {
    this.socket?.end();
    this.socket = null;
  }

  async ping(): Promise<{ pong: boolean; pid: number }> {
    const resp = await this.send("ping", {});
    return resp.data as { pong: boolean; pid: number };
  }

  async list(): Promise<ScheduledTask[]> {
    const resp = await this.send("list", {});
    return resp.data as ScheduledTask[];
  }

  async schedule(
    opts: Parameters<import("../scheduler/TaskScheduler.js")["TaskScheduler"]["prototype"]["schedule"]>[0]
  ): Promise<ScheduledTask> {
    const resp = await this.send("schedule", opts);
    return resp.data as ScheduledTask;
  }

  async cancel(taskId: string): Promise<boolean> {
    const resp = await this.send("cancel", { taskId });
    return (resp.data as { cancelled: boolean }).cancelled;
  }

  async status(): Promise<{ running: boolean; tasks: number; pid: number }> {
    const resp = await this.send("status", {});
    return resp.data as { running: boolean; tasks: number; pid: number };
  }

  async shutdown(): Promise<void> {
    await this.send("shutdown", {});
  }

  private send(kind: IpcMessageKind, payload: unknown): Promise<IpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Not connected to kairos daemon"));
        return;
      }
      const id = randomUUID();
      this.pending.set(id, { resolve, reject });
      const msg: IpcMessage = { kind, id, payload };
      this.socket.write(JSON.stringify(msg) + "\n");

      // Timeout after 10s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`IPC timeout for ${kind}`));
        }
      }, 10_000);
    });
  }
}
packages/kairos/src/client/index.ts
TypeScript

export { KairosClient } from "./KairosClient.js";
Update packages/kairos/src/index.ts
TypeScript

export * from "./scheduler/index.js";
export * from "./watcher/index.js";
export * from "./daemon/index.js";
export * from "./client/index.js";     // Phase 7 addition
PART G — Core Phase 7 additions: ReAct planner + beam search
packages/core/src/planning/types.ts
TypeScript

export type PlanningMode = "react" | "beam" | "none";

export interface ReActStep {
  thought: string;
  action: string;
  actionInput: unknown;
  observation?: string;
}

export interface BeamCandidate {
  plan: string[];
  score: number;
  tokens: number;
}

export interface PlanningConfig {
  mode: PlanningMode;
  /** For beam: number of candidates to maintain */
  beamWidth?: number;
  /** For beam: max planning steps */
  maxPlanningSteps?: number;
  /** For react: max reason+act cycles before executing */
  maxReactCycles?: number;
}
packages/core/src/planning/ReActPlanner.ts
TypeScript

import { queryLoop } from "../queryLoop.js";
import type { QueryEngine } from "../services/QueryEngine.js";
import type { ToolDefinition } from "../tools/types.js";
import type { ReActStep } from "./types.js";

const REACT_SYSTEM_PROMPT = `You are a ReAct (Reason + Act) agent.
For each step, FIRST reason about what to do, THEN decide on an action.

Format your response as:
THOUGHT: <your reasoning about the current situation>
ACTION: <tool_name or "FINAL_ANSWER">
ACTION_INPUT: <JSON input for the tool, or your final answer text>

If you have enough information to answer, use ACTION: FINAL_ANSWER.`;

export class ReActPlanner {
  constructor(
    private engine: QueryEngine,
    private tools: ToolDefinition[],
    private maxCycles = 5
  ) {}

  async plan(prompt: string): Promise<{ steps: ReActStep[]; finalAnswer: string }> {
    const steps: ReActStep[] = [];
    let context = prompt;

    for (let cycle = 0; cycle < this.maxCycles; cycle++) {
      let rawOutput = "";

      try {
        for await (const event of queryLoop(context, {
          engine: this.engine,
          systemPrompt: REACT_SYSTEM_PROMPT,
          tools: [],
          maxTurns: 1,
          maxTokens: 800,
        })) {
          if (event.type === "text") rawOutput += event.text;
        }
      } catch {
        break;
      }

      const thought = rawOutput.match(/THOUGHT:\s*(.+?)(?=\nACTION:|$)/s)?.[1]?.trim() ?? "";
      const action = rawOutput.match(/ACTION:\s*(.+?)(?=\nACTION_INPUT:|$)/s)?.[1]?.trim() ?? "";
      const actionInputRaw =
        rawOutput.match(/ACTION_INPUT:\s*([\s\S]+)/)?.[1]?.trim() ?? "";

      if (action === "FINAL_ANSWER") {
        steps.push({ thought, action, actionInput: null, observation: actionInputRaw });
        return { steps, finalAnswer: actionInputRaw };
      }

      let actionInput: unknown = actionInputRaw;
      try {
        actionInput = JSON.parse(actionInputRaw);
      } catch {
        // raw string input is fine
      }

      // Execute the tool
      const tool = this.tools.find((t) => t.name === action);
      let observation = `Tool "${action}" not found.`;

      if (tool) {
        try {
          const result = await tool.execute(actionInput, {
            workingDirectory: process.cwd(),
            sessionId: "react-planner",
            permissionLevel: 2,
          } as Parameters<typeof tool.execute>[1]);
          observation = result.content;
        } catch (err) {
          observation = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      steps.push({ thought, action, actionInput, observation });

      // Build next-cycle context with history
      context = [
        prompt,
        ``,
        `Previous steps:`,
        ...steps.map(
          (s, i) =>
            `Step ${i + 1}: THOUGHT: ${s.thought}\nACTION: ${s.action}\nOBSERVATION: ${s.observation}`
        ),
        ``,
        `Continue reasoning based on the observations above.`,
      ].join("\n");
    }

    // Max cycles reached — synthesize from observations
    const finalAnswer = steps
      .filter((s) => s.observation)
      .map((s) => s.observation)
      .join("\n");

    return { steps, finalAnswer };
  }
}
packages/core/src/planning/BeamPlanner.ts
TypeScript

import { queryLoop } from "../queryLoop.js";
import type { QueryEngine } from "../services/QueryEngine.js";
import type { BeamCandidate } from "./types.js";

const BEAM_SYSTEM_PROMPT = `You are a planning agent that generates multiple candidate plans.
For the given task, generate exactly {{width}} different approaches, ordered from most to least promising.

Format each plan as:
PLAN {{n}}:
SCORE: <0.0-1.0 where 1.0 is best>
STEPS:
1. <step>
2. <step>
---`;

export class BeamPlanner {
  constructor(
    private engine: QueryEngine,
    private beamWidth = 3,
    private maxSteps = 6
  ) {}

  async generateCandidates(prompt: string): Promise<BeamCandidate[]> {
    const systemPrompt = BEAM_SYSTEM_PROMPT.replace(
      "{{width}}",
      String(this.beamWidth)
    );

    let rawOutput = "";
    let inputTokens = 0;

    try {
      for await (const event of queryLoop(
        `Generate ${this.beamWidth} candidate plans for:\n\n${prompt}`,
        {
          engine: this.engine,
          systemPrompt,
          tools: [],
          maxTurns: 1,
          maxTokens: 2000,
        }
      )) {
        if (event.type === "text") rawOutput += event.text;
        if (event.type === "complete") inputTokens = event.totalInputTokens;
      }
    } catch {
      return [{ plan: [prompt], score: 1.0, tokens: 0 }];
    }

    return this.parseCandidates(rawOutput, inputTokens);
  }

  /** Select the best candidate (highest score). */
  selectBest(candidates: BeamCandidate[]): BeamCandidate {
    return (
      candidates.sort((a, b) => b.score - a.score)[0] ?? {
        plan: [],
        score: 0,
        tokens: 0,
      }
    );
  }

  private parseCandidates(raw: string, tokens: number): BeamCandidate[] {
    const blocks = raw.split("---").filter((b) => b.trim());
    const candidates: BeamCandidate[] = [];

    for (const block of blocks) {
      const scoreMatch = block.match(/SCORE:\s*([\d.]+)/);
      const stepsMatch = block.match(/STEPS:\s*\n((?:\d+\. .+\n?)+)/);

      if (!stepsMatch) continue;

      const score = scoreMatch ? parseFloat(scoreMatch[1]!) : 0.5;
      const steps = stepsMatch[1]!
        .split("\n")
        .filter((l) => l.match(/^\d+\./))
        .map((l) => l.replace(/^\d+\.\s*/, "").trim());

      if (steps.length > 0) {
        candidates.push({
          plan: steps.slice(0, this.maxSteps),
          score: Math.min(1, Math.max(0, score)),
          tokens,
        });
      }
    }

    return candidates.length > 0
      ? candidates
      : [{ plan: [raw.slice(0, 500)], score: 0.5, tokens }];
  }
}
packages/core/src/planning/index.ts
TypeScript

export { ReActPlanner } from "./ReActPlanner.js";
export { BeamPlanner } from "./BeamPlanner.js";
export type { PlanningMode, PlanningConfig, ReActStep, BeamCandidate } from "./types.js";
Update packages/core/src/index.ts — Phase 7 additions
TypeScript

// Add to existing Phase 6 exports at the bottom:

// --- Phase 7 additions ---
export * from "./planning/index.js";
Update packages/core/package.json exports — Phase 7
JSON

{
  "exports": {
    ".": "./src/index.ts",
    "./tools": "./src/tools/index.ts",
    "./tools/graphify": "./src/tools/graphify/index.ts",
    "./providers": "./src/providers/index.ts",
    "./hooks": "./src/hooks/index.ts",
    "./session": "./src/session/index.ts",
    "./skills": "./src/skills/index.ts",
    "./mcp": "./src/mcp/index.ts",
    "./planning": "./src/planning/index.ts"
  }
}
PART H — Streaming providers (Anthropic + OpenAI)
packages/core/src/providers/AnthropicStreamingProvider.ts
TypeScript

import Anthropic from "@anthropic-ai/sdk";
import type { StreamChunk, StreamingProvider } from "../services/streaming/StreamingProvider.js";
import type { Message, ToolDefinition } from "../types.js";

export class AnthropicStreamingProvider implements StreamingProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async *stream(opts: {
    systemPrompt: string;
    messages: Message[];
    tools: ToolDefinition[];
    maxTokens?: number;
  }): AsyncIterable<StreamChunk> {
    const anthropicMessages = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          typeof m.content === "string"
            ? m.content
            : m.content.map((b) => {
                if (b.type === "text") return { type: "text" as const, text: b.text };
                if (b.type === "tool_use") {
                  return {
                    type: "tool_use" as const,
                    id: b.id,
                    name: b.name,
                    input: b.input,
                  };
                }
                if (b.type === "tool_result") {
                  return {
                    type: "tool_result" as const,
                    tool_use_id: b.tool_use_id ?? "",
                    content: b.content,
                  };
                }
                return { type: "text" as const, text: "" };
              }),
      }));

    const anthropicTools =
      opts.tools.length > 0
        ? opts.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
          }))
        : undefined;

    const stream = await this.client.messages.stream({
      model: this.model,
      system: opts.systemPrompt,
      messages: anthropicMessages,
      tools: anthropicTools,
      max_tokens: opts.maxTokens ?? 4096,
    });

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_delta":
          if (event.delta.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            yield { type: "tool_use_delta", toolInputDelta: event.delta.partial_json };
          }
          break;

        case "content_block_start":
          if (event.content_block.type === "tool_use") {
            yield {
              type: "tool_use_start",
              toolName: event.content_block.name,
              toolId: event.content_block.id,
            };
          }
          break;

        case "content_block_stop":
          if (event.index !== undefined) {
            yield { type: "tool_use_end" };
          }
          break;

        case "message_delta":
          if (event.usage) {
            yield { type: "usage", outputTokens: event.usage.output_tokens };
          }
          break;

        case "message_start":
          if (event.message.usage) {
            yield { type: "usage", inputTokens: event.message.usage.input_tokens };
          }
          break;

        case "message_stop":
          yield { type: "message_stop" };
          break;
      }
    }
  }
}
packages/core/src/providers/OpenAIStreamingProvider.ts
TypeScript

import OpenAI from "openai";
import type { StreamChunk, StreamingProvider } from "../services/streaming/StreamingProvider.js";
import type { Message, ToolDefinition } from "../types.js";

export class OpenAIStreamingProvider implements StreamingProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, baseUrl: string, model: string) {
    this.client = new OpenAI({ apiKey: apiKey || "unused", baseURL: baseUrl });
    this.model = model;
  }

  async *stream(opts: {
    systemPrompt: string;
    messages: Message[];
    tools: ToolDefinition[];
    maxTokens?: number;
  }): AsyncIterable<StreamChunk> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: opts.systemPrompt },
      ...opts.messages
        .filter((m) => m.role !== "system")
        .map((m): OpenAI.ChatCompletionMessageParam => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
    ];

    const tools: OpenAI.ChatCompletionTool[] =
      opts.tools.length > 0
        ? opts.tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.inputSchema as Record<string, unknown>,
            },
          }))
        : [];

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: opts.maxTokens ?? 4096,
      stream: true,
    });

    const toolCallAccumulator = new Map<
      number,
      { id: string; name: string; args: string }
    >();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: "text_delta", text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallAccumulator.has(idx)) {
            toolCallAccumulator.set(idx, { id: "", name: "", args: "" });
            if (tc.id) {
              toolCallAccumulator.get(idx)!.id = tc.id;
            }
            if (tc.function?.name) {
              toolCallAccumulator.get(idx)!.name = tc.function.name;
              yield {
                type: "tool_use_start",
                toolName: tc.function.name,
                toolId: tc.id ?? "",
              };
            }
          }

          if (tc.function?.arguments) {
            toolCallAccumulator.get(idx)!.args += tc.function.arguments;
            yield { type: "tool_use_delta", toolInputDelta: tc.function.arguments };
          }
        }
      }

      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason === "tool_calls") {
        for (const [_idx, tc] of toolCallAccumulator) {
          if (tc.name) yield { type: "tool_use_end" };
        }
      }

      if (chunk.usage) {
        yield {
          type: "usage",
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
      }
    }

    yield { type: "message_stop" };
  }
}
PART I — New Phase 7 slash commands
packages/core/src/commands/research.ts
TypeScript

import type { SlashCommand } from "./types.js";

export const researchCommand: SlashCommand = {
  name: "research",
  summary: "Run an AutoResearch loop on a question.",
  async execute(args, ctx) {
    if (!args.trim()) {
      return [
        "Usage: /research <question>",
        "",
        "Runs a full Plan → Execute → Report research loop.",
        "The report is saved to the project wiki automatically.",
      ].join("\n");
    }

    if (!ctx.runTurn) {
      return "runTurn not available in this context.";
    }

    await ctx.runTurn(`Use the research tool to thoroughly investigate this question: ${args}`);
    return "";
  },
};
packages/core/src/commands/council.ts
TypeScript

import type { SlashCommand } from "./types.js";

export const councilCommand: SlashCommand = {
  name: "council",
  summary: "Run a council debate on a question.",
  async execute(args, ctx) {
    if (!args.trim()) {
      return [
        "Usage: /council <question>",
        "",
        "Runs a multi-agent council debate (Architect, Pragmatist, Skeptic).",
        "Produces a consensus verdict with key caveats.",
      ].join("\n");
    }

    if (!ctx.runTurn) return "runTurn not available.";
    await ctx.runTurn(
      `Use the council_debate tool to get a multi-perspective verdict on: ${args}`
    );
    return "";
  },
};
packages/core/src/commands/simulate.ts
TypeScript

import type { SlashCommand } from "./types.js";

export const simulateCommand: SlashCommand = {
  name: "simulate",
  summary: "Run a MiroFish multi-agent simulation.",
  async execute(args, ctx) {
    if (!args.trim()) {
      return [
        "Usage: /simulate <scenario description>",
        "",
        "Runs a simulation with default agents.",
        "For custom agents, use the simulate tool directly.",
      ].join("\n");
    }

    if (!ctx.runTurn) return "runTurn not available.";

    await ctx.runTurn(
      `Use the simulate tool to run a simulation of this scenario: ${args}. Use 3 agents with complementary perspectives and 3 rounds.`
    );
    return "";
  },
};
packages/core/src/commands/kairos.ts
TypeScript

import type { SlashCommand } from "./types.js";

export const kairosCommand: SlashCommand = {
  name: "kairos",
  summary: "Manage Kairos scheduled tasks. Usage: /kairos [list|status|add|cancel]",
  async execute(args) {
    const [subcommand, ...rest] = args.trim().split(" ");

    // Late-import to avoid hard dep if daemon not running
    const { KairosClient } = await import("@cowork/kairos/client");
    const client = new KairosClient();

    if (!client.isDaemonRunning()) {
      return [
        "Kairos daemon is not running.",
        "",
        "Start it with:",
        "  bun run apps/kairos-daemon/src/index.ts",
        "",
        "Or enable it in .env: COWORK_KAIROS_ENABLED=true",
      ].join("\n");
    }

    try {
      await client.connect();

      switch (subcommand ?? "list") {
        case "list": {
          const tasks = await client.list();
          if (tasks.length === 0) return "No scheduled tasks.";
          const lines = tasks.map(
            (t) =>
              `  ${t.status.padEnd(10)} ${t.name.padEnd(20)} [${t.kind}] ${t.nextRunAt ? `next: ${t.nextRunAt.slice(0, 16)}` : ""}`
          );
          return ["Scheduled tasks:", ...lines].join("\n");
        }

        case "status": {
          const status = await client.status();
          return [
            `Kairos daemon status:`,
            `  Running: ${status.running}`,
            `  Tasks:   ${status.tasks}`,
            `  PID:     ${status.pid}`,
          ].join("\n");
        }

        case "cancel": {
          const taskId = rest[0];
          if (!taskId) return "Usage: /kairos cancel <taskId>";
          const cancelled = await client.cancel(taskId);
          return cancelled ? `Task ${taskId} cancelled.` : `Task ${taskId} not found.`;
        }

        default:
          return "Usage: /kairos [list|status|cancel <id>]";
      }
    } finally {
      await client.disconnect();
    }
  },
};
packages/core/src/commands/hermes.ts
TypeScript

import type { SlashCommand } from "./types.js";

export const hermesCommand: SlashCommand = {
  name: "hermes",
  summary: "Start/stop the Hermes MCP server. Usage: /hermes [start|stop|status]",
  async execute(args, ctx) {
    const subcommand = args.trim() || "status";
    const port = parseInt(process.env["COWORK_HERMES_PORT"] ?? "3100", 10);
    const transport = (process.env["COWORK_HERMES_TRANSPORT"] ?? "sse") as "stdio" | "sse";

    switch (subcommand) {
      case "status":
        try {
          const resp = await fetch(`http://localhost:${port}/health`, {
            signal: AbortSignal.timeout(1000),
          });
          if (resp.ok) {
            const data = (await resp.json()) as { tools: string[] };
            return [
              `Hermes MCP server is running on port ${port}`,
              `Exposed tools: ${data.tools?.join(", ") ?? "unknown"}`,
            ].join("\n");
          }
          return `Hermes server responded with ${resp.status}`;
        } catch {
          return `Hermes MCP server is not running on port ${port}.`;
        }

      case "start":
        return [
          `To start the Hermes MCP server, run in a separate terminal:`,
          `  COWORK_HERMES_TRANSPORT=${transport} COWORK_HERMES_PORT=${port} bun run packages/hermes/src/start.ts`,
          ``,
          `Or set COWORK_HERMES_ENABLED=true in .env to auto-start with the CLI.`,
        ].join("\n");

      default:
        return "Usage: /hermes [start|stop|status]";
    }
  },
};
Update packages/core/src/commands/registry.ts — add Phase 7 commands
TypeScript

import { researchCommand } from "./research.js";
import { councilCommand } from "./council.js";
import { simulateCommand } from "./simulate.js";
import { kairosCommand } from "./kairos.js";
import { hermesCommand } from "./hermes.js";

// Add to defaultRegistry():
registry.register(researchCommand);
registry.register(councilCommand);
registry.register(simulateCommand);
registry.register(kairosCommand);
registry.register(hermesCommand);
PART J — Add orchestrator + research + mirofish + council tools to SessionRuntime
Update apps/cowork-cli/src/session.ts — Phase 7 additions
TypeScript

import { Coordinator } from "@cowork/orchestrator/coordinator";
import { CouncilDebate } from "@cowork/orchestrator/council";
import { ResearchPlanner } from "@cowork/research/planner";
import { ResearchExecutor } from "@cowork/research/executor";
import { ResearchReporter } from "@cowork/research/reporter";
import { makeResearchTools } from "@cowork/research/tools";
import { SimulationRunner } from "@cowork/mirofish/simulation";
import { makeSimulationTools } from "@cowork/mirofish/tools";
import { GatewayServer } from "@cowork/openclaw/gateway";
import { TelegramBot } from "@cowork/openclaw/telegram";
import { HermesServer } from "@cowork/hermes/server";

// Inside buildSessionRuntime(), after Phase 6 wiring:

// --- Phase 7: Orchestrator + Council ---
const coordinator = new Coordinator({
  engine,
  tools: DEFAULT_TOOLS,
  systemPrompt: SYSTEM_PROMPT,
  workerCount: parseInt(process.env["COWORK_WORKER_COUNT"] ?? "3", 10),
  enablePlanning: process.env["COWORK_COORDINATOR_PLANNING"] === "true",
});

const council = new CouncilDebate(engine, DEFAULT_TOOLS);

// Coordinator tool (agent can delegate sub-tasks)
const coordinatorTool: ToolDefinition = {
  name: "orchestrate",
  description:
    "Delegate a complex task to the multi-agent coordinator. " +
    "The coordinator decomposes it into subtasks, runs worker agents in parallel, " +
    "and synthesizes the results.",
  permissionLevel: PermissionLevel.STANDARD,
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The complex task to orchestrate." },
      parallel: {
        type: "boolean",
        description: "Run subtasks in parallel (default true).",
      },
    },
    required: ["prompt"],
  },
  async execute(input: { prompt: string; parallel?: boolean }) {
    const result = await coordinator.run(input.prompt);
    return { content: result.synthesis, isError: false };
  },
};

// Council debate tool
const councilTool: ToolDefinition = {
  name: "council_debate",
  description:
    "Run a multi-agent council debate. Three AI council members (Architect, Pragmatist, Skeptic) " +
    "debate your question and produce a consensus verdict.",
  permissionLevel: PermissionLevel.STANDARD,
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question or decision to debate." },
      rounds: { type: "number", description: "Number of debate rounds (default 2, max 4)." },
    },
    required: ["question"],
  },
  async execute(input: { question: string; rounds?: number }) {
    const result = await council.debate(input.question, {
      rounds: Math.min(input.rounds ?? 2, 4),
    });
    return { content: result.verdict, isError: false };
  },
};

// --- Phase 7: Research ---
const researchPlanner = new ResearchPlanner(engine);
const researchExecutor = new ResearchExecutor(engine, DEFAULT_TOOLS);
const researchReporter = new ResearchReporter(engine, wikiStore);
const researchTools = makeResearchTools(researchPlanner, researchExecutor, researchReporter);

// --- Phase 7: MiroFish ---
const simulationRunner = new SimulationRunner(engine, DEFAULT_TOOLS, wikiStore);
const simulationTools = makeSimulationTools(simulationRunner);

// --- Phase 7: OpenClaw (optional, based on env) ---
let gatewayServer: GatewayServer | null = null;
let telegramBot: TelegramBot | null = null;

if (process.env["COWORK_OPENCLAW_ENABLED"] === "true") {
  const gatewayPort = parseInt(process.env["COWORK_GATEWAY_PORT"] ?? "4242", 10);
  const rateLimit = parseInt(process.env["COWORK_GATEWAY_RATE_LIMIT"] ?? "20", 10);

  gatewayServer = new GatewayServer({
    port: gatewayPort,
    rateLimitPerMinute: rateLimit,
    authToken: process.env["COWORK_GATEWAY_AUTH_TOKEN"],
  });

  const gatewayHandler = async (msg: import("@cowork/openclaw/gateway").InboundMessage) => {
    let response = "";
    for await (const event of queryLoop(msg.text, {
      engine,
      systemPrompt: SYSTEM_PROMPT,
      tools: DEFAULT_TOOLS,
      maxTurns: 10,
      requestApproval: async () => false, // Gateway auto-denies dangerous ops
    })) {
      if (event.type === "text") response += event.text;
    }
    return response || "No response generated.";
  };

  gatewayServer.onMessage(gatewayHandler);
  gatewayServer.start();

  if (process.env["TELEGRAM_BOT_TOKEN"]) {
    telegramBot = new TelegramBot({
      token: process.env["TELEGRAM_BOT_TOKEN"],
      rateLimitPerMinute: rateLimit,
      allowedChatIds: (process.env["TELEGRAM_ALLOWED_CHATS"] ?? "")
        .split(",")
        .filter(Boolean)
        .map(Number),
    });
    telegramBot.onMessage(gatewayHandler);
    telegramBot.startPolling();
  }
}

// --- Phase 7: Hermes MCP server (optional) ---
let hermesServer: HermesServer | null = null;

if (process.env["COWORK_HERMES_ENABLED"] === "true") {
  const transport = (process.env["COWORK_HERMES_TRANSPORT"] ?? "sse") as "stdio" | "sse";
  const hermesPort = parseInt(process.env["COWORK_HERMES_PORT"] ?? "3100", 10);

  hermesServer = new HermesServer(
    {
      transport,
      port: transport === "sse" ? hermesPort : undefined,
      authToken: process.env["COWORK_HERMES_AUTH_TOKEN"],
      toolAllowlist: (process.env["COWORK_HERMES_TOOL_ALLOWLIST"] ?? "")
        .split(",")
        .filter(Boolean),
      serverName: "locoworker-hermes",
    },
    [...DEFAULT_TOOLS]
  );

  if (transport === "sse") {
    hermesServer.startSse();
  }
  // stdio transport is started by the separate hermes binary
}

// --- Update on-complete hook to clean up Phase 7 resources ---
hooks.register("on-complete", async (_ctx) => {
  if (telegramBot) telegramBot.stopPolling();
  if (gatewayServer) gatewayServer.stop();
  // hermesServer runs independently and is not stopped on session end
});

// --- Final tool list (Phase 7) ---
const tools = [
  ...DEFAULT_TOOLS,
  ...makeMemoryTools(memory, sessionId),
  ...(settings.enableGraphify ? graphifyTools : []),
  ...mcpTools,
  ...wikiTools,
  ...researchTools,
  ...simulationTools,
  coordinatorTool,
  councilTool,
];

// Return extended runtime (Phase 7 additions)
return {
  // ... all existing Phase 6 runtime fields ...
  coordinator,
  council,
  researchPlanner,
  researchExecutor,
  researchReporter,
  simulationRunner,
  gatewayServer,
  telegramBot,
  hermesServer,
};
PART K — Hermes standalone start script
packages/hermes/src/start.ts
TypeScript

#!/usr/bin/env bun
/**
 * Standalone Hermes MCP server starter.
 * Usage: bun run packages/hermes/src/start.ts
 */
import { HermesServer } from "./server/HermesServer.js";
import {
  resolveProvider,
  QueryEngine,
  resolveSettings,
  DEFAULT_TOOLS,
} from "@cowork/core";
import { makeMemoryTools, MemorySystem } from "@cowork/core";

const cwd = process.cwd();
const settings = resolveSettings(cwd, process.env, {});

const transport = (process.env["COWORK_HERMES_TRANSPORT"] ?? "stdio") as "stdio" | "sse";
const port = parseInt(process.env["COWORK_HERMES_PORT"] ?? "3100", 10);
const authToken = process.env["COWORK_HERMES_AUTH_TOKEN"];
const toolAllowlist = (process.env["COWORK_HERMES_TOOL_ALLOWLIST"] ?? "")
  .split(",")
  .filter(Boolean);

const memory = new MemorySystem({ projectRoot: cwd });
await memory.store.init();
const sessionId = `hermes-${Date.now()}`;

const tools = [
  ...DEFAULT_TOOLS,
  ...makeMemoryTools(memory, sessionId),
];

const server = new HermesServer(
  { transport, port, authToken, toolAllowlist },
  tools
);

process.stderr.write(
  `[hermes] Starting MCP server (transport: ${transport}${transport === "sse" ? `, port: ${port}` : ""})\n`
);

if (transport === "stdio") {
  await server.startStdio();
} else {
  server.startSse();
  // Keep alive
  await new Promise(() => {});
}
PART L — Update workspace topology files
Update root tsconfig.json
JSON

{
  "files": [],
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/graphify" },
    { "path": "./packages/telemetry" },
    { "path": "./packages/analytics" },
    { "path": "./packages/security" },
    { "path": "./packages/kairos" },
    { "path": "./packages/wiki" },
    { "path": "./packages/research" },
    { "path": "./packages/orchestrator" },
    { "path": "./packages/mirofish" },
    { "path": "./packages/openclaw" },
    { "path": "./packages/hermes" },
    { "path": "./packages/plugins" },
    { "path": "./apps/cowork-cli" },
    { "path": "./apps/kairos-daemon" }
  ]
}
Update apps/cowork-cli/package.json — Phase 7 deps
JSON

{
  "dependencies": {
    "@cowork/core": "workspace:*",
    "@cowork/graphify": "workspace:*",
    "@cowork/telemetry": "workspace:*",
    "@cowork/analytics": "workspace:*",
    "@cowork/security": "workspace:*",
    "@cowork/kairos": "workspace:*",
    "@cowork/wiki": "workspace:*",
    "@cowork/research": "workspace:*",
    "@cowork/orchestrator": "workspace:*",
    "@cowork/mirofish": "workspace:*",
    "@cowork/openclaw": "workspace:*",
    "@cowork/hermes": "workspace:*",
    "@cowork/plugins": "workspace:*"
  }
}
Update apps/cowork-cli/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/core" },
    { "path": "../../packages/graphify" },
    { "path": "../../packages/telemetry" },
    { "path": "../../packages/analytics" },
    { "path": "../../packages/security" },
    { "path": "../../packages/kairos" },
    { "path": "../../packages/wiki" },
    { "path": "../../packages/research" },
    { "path": "../../packages/orchestrator" },
    { "path": "../../packages/mirofish" },
    { "path": "../../packages/openclaw" },
    { "path": "../../packages/hermes" }
  ]
}
Update tsconfig.base.json — Phase 7 paths
JSON

{
  "compilerOptions": {
    "paths": {
      "@cowork/core":             ["./packages/core/src/index.ts"],
      "@cowork/core/*":           ["./packages/core/src/*"],
      "@cowork/graphify":         ["./packages/graphify/src/index.ts"],
      "@cowork/graphify/*":       ["./packages/graphify/src/*"],
      "@cowork/telemetry":        ["./packages/telemetry/src/index.ts"],
      "@cowork/telemetry/*":      ["./packages/telemetry/src/*"],
      "@cowork/analytics":        ["./packages/analytics/src/index.ts"],
      "@cowork/analytics/*":      ["./packages/analytics/src/*"],
      "@cowork/security":         ["./packages/security/src/index.ts"],
      "@cowork/security/*":       ["./packages/security/src/*"],
      "@cowork/kairos":           ["./packages/kairos/src/index.ts"],
      "@cowork/kairos/*":         ["./packages/kairos/src/*"],
      "@cowork/wiki":             ["./packages/wiki/src/index.ts"],
      "@cowork/wiki/*":           ["./packages/wiki/src/*"],
      "@cowork/research":         ["./packages/research/src/index.ts"],
      "@cowork/research/*":       ["./packages/research/src/*"],
      "@cowork/orchestrator":     ["./packages/orchestrator/src/index.ts"],
      "@cowork/orchestrator/*":   ["./packages/orchestrator/src/*"],
      "@cowork/mirofish":         ["./packages/mirofish/src/index.ts"],
      "@cowork/mirofish/*":       ["./packages/mirofish/src/*"],
      "@cowork/openclaw":         ["./packages/openclaw/src/index.ts"],
      "@cowork/openclaw/*":       ["./packages/openclaw/src/*"],
      "@cowork/hermes":           ["./packages/hermes/src/index.ts"],
      "@cowork/hermes/*":         ["./packages/hermes/src/*"],
      "@cowork/plugins":          ["./packages/plugins/src/index.ts"]
    }
  }
}
Update .env.example — Phase 7 additions
Bash

# ── Phase 7: Multi-Agent Orchestrator ───────────────────────
COWORK_WORKER_COUNT=3
COWORK_COORDINATOR_PLANNING=true

# ── Phase 7: OpenClaw Messaging Gateway ─────────────────────
COWORK_OPENCLAW_ENABLED=false
COWORK_GATEWAY_PORT=4242
COWORK_GATEWAY_RATE_LIMIT=20
COWORK_GATEWAY_AUTH_TOKEN=change-me-in-production

# ── Phase 7: Telegram Bot (OpenClaw) ────────────────────────
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_CHATS=

# ── Phase 7: Hermes MCP Server ──────────────────────────────
COWORK_HERMES_ENABLED=false
COWORK_HERMES_TRANSPORT=sse
COWORK_HERMES_PORT=3100
COWORK_HERMES_AUTH_TOKEN=change-me-in-production
COWORK_HERMES_TOOL_ALLOWLIST=read,glob,grep,bash,wiki_read,wiki_search

# ── Phase 7: MiroFish ────────────────────────────────────────
COWORK_MIROFISH_DEFAULT_ROUNDS=3
COWORK_MIROFISH_DEFAULT_AGENTS=3
COWORK_MIROFISH_CONCURRENCY=3
COWORK_MIROFISH_SAVE_TO_WIKI=true
COWORK_MIROFISH_SAVE_TO_MEMORY=false
PART M — phase7complete.md
Markdown

# Phase 7 Complete

## What was built

Phase 7 adds the "Multi-Agent & Gateway" layer to locoworker.

### New packages

| Package                 | Description                                                        |
|-------------------------|--------------------------------------------------------------------|
| `@cowork/orchestrator`  | Coordinator/worker pool, task queue, council debate pattern        |
| `@cowork/research`      | AutoResearch loop: plan → execute → synthesize → report            |
| `@cowork/mirofish`      | Multi-agent simulation studio with configurable agents and rounds  |
| `@cowork/openclaw`      | HTTP gateway + Telegram bot for external message routing to agent  |
| `@cowork/hermes`        | MCP server host — exposes locoworker tools to external MCP clients |

### New apps

| App                     | Description                                                        |
|-------------------------|--------------------------------------------------------------------|
| `apps/kairos-daemon`    | Standalone Bun process for the Kairos scheduler with Unix IPC      |

### Core additions

- `ReActPlanner` — Reason + Act planning loop for structured multi-step execution
- `BeamPlanner` — Beam search plan generator (multiple candidates, score-ranked)
- `AnthropicStreamingProvider` — Real streaming implementation for Anthropic
- `OpenAIStreamingProvider` — Real streaming implementation for OpenAI-compatible endpoints
- `@cowork/core/planning` export subpath

### CLI additions

- New slash commands: `/research`, `/council`, `/simulate`, `/kairos`, `/hermes`
- `SessionRuntime` now instantiates and exposes coordinator, council, research, simulation, gateway, and hermes
- Tools added to agent: `orchestrate`, `council_debate`, `research`, `research_plan`, `simulate`

### Updated wiring

- Root `tsconfig.json` references 14 workspace packages + 2 apps
- `tsconfig.base.json` paths covers all 12 packages
- `apps/cowork-cli/tsconfig.json` references all 12 packages
- `.env.example` documents all Phase 7 env vars
- `KairosClient` added to `@cowork/kairos` for IPC communication with the daemon

## Remaining for Phase 8

- `@cowork/plugins` — real plugin marketplace + plugin sandboxing
- Full SSE bidirectional transport in Hermes (message queuing, reconnection)
- `council_debate` tool exposed as a direct agent tool (currently slash-command only)
- Network sandbox enforcement (intercept fetch, not just advisory)
- Voice interface integration
- Eval harness test suite (`.cowork/evals/*.json` loader + CI runner)
- Full OTLP SDK replacement (replace fetch-based flush)
- Desktop app wrapper (Electron/Tauri)
Complete Phase 7 file manifest
text

packages/
  orchestrator/
    package.json
    tsconfig.json
    src/
      index.ts
      queue/
        types.ts
        TaskQueue.ts
        index.ts
      worker/
        AgentWorker.ts
        WorkerPool.ts
        index.ts
      coordinator/
        Coordinator.ts
        index.ts
      council/
        CouncilDebate.ts
        index.ts

  research/
    package.json
    tsconfig.json
    src/
      index.ts
      planner/
        types.ts
        ResearchPlanner.ts
        index.ts
      executor/
        ResearchExecutor.ts
        index.ts
      reporter/
        ResearchReporter.ts
        index.ts
      tools/
        ResearchTools.ts
        index.ts

  mirofish/
    package.json
    tsconfig.json
    src/
      index.ts
      agents/
        SimAgent.ts
        index.ts
      simulation/
        types.ts
        SimulationRunner.ts
        index.ts
      tools/
        SimulationTools.ts
        index.ts

  openclaw/
    package.json
    tsconfig.json
    src/
      index.ts
      gateway/
        types.ts
        RateLimiter.ts
        GatewayServer.ts
        index.ts
      telegram/
        TelegramBot.ts
        index.ts

  hermes/
    package.json
    tsconfig.json
    src/
      index.ts
      server/
        types.ts
        HermesServer.ts
        index.ts
      transport/
        index.ts
      start.ts

  kairos/
    src/
      client/                   ← NEW
        KairosClient.ts
        index.ts
      index.ts                  ← UPDATED (re-exports client)

  core/
    src/
      planning/                 ← NEW
        types.ts
        ReActPlanner.ts
        BeamPlanner.ts
        index.ts
      providers/
        AnthropicStreamingProvider.ts  ← NEW
        OpenAIStreamingProvider.ts     ← NEW
      index.ts                  ← UPDATED
      package.json              ← UPDATED (exports ./planning)

apps/
  kairos-daemon/               ← NEW
    package.json
    tsconfig.json
    src/
      ipc.ts
      index.ts

  cowork-cli/
    src/
      session.ts               ← UPDATED (Phase 7 wiring)
    package.json               ← UPDATED
    tsconfig.json              ← UPDATED

packages/core/src/commands/
  research.ts                  ← NEW
  council.ts                   ← NEW
  simulate.ts                  ← NEW
  kairos.ts                    ← NEW
  hermes.ts                    ← NEW
  registry.ts                  ← UPDATED

root/
  tsconfig.json                ← UPDATED
  tsconfig.base.json           ← UPDATED
  .env.example                 ← UPDATED
  phase7complete.md            ← NEW





