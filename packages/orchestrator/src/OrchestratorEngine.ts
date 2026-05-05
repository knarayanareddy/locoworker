import type {
  AgentSpec,
  AgentRole,
  OrchestrationPlan,
  OrchestrationResult,
  TaskResult,
} from "./types";
import {
  QueryEngine,
  resolveProvider,
  type ToolDefinition,
  type ResolvedSettings,
} from "@cowork/core";

export interface OrchestratorConfig {
  projectRoot: string;
  settings: ResolvedSettings;
  tools: ToolDefinition[];
  maxRetries?: number;    // per task, default 2
  verbose?: boolean;
}

export class OrchestratorEngine {
  private config: OrchestratorConfig;
  private engine: QueryEngine;
  private totalTurns = 0;

  constructor(config: OrchestratorConfig) {
    this.config = { maxRetries: 2, verbose: false, ...config };
    const providerConfig = resolveProvider({
      provider: config.settings.provider,
      model: config.settings.model,
      env: process.env as any,
    });
    this.engine = new QueryEngine(providerConfig);
  }

  // ── Main entry point ───────────────────────────────────────────────────────

  async run(goal: string, agents: AgentSpec[]): Promise<OrchestrationResult> {
    const plan = await this.plan(goal, agents);
    const taskResults: TaskResult[] = [];
    const completedTaskIds = new Set<string>();

    // Topological execution respecting dependsOn
    const remaining = [...plan.tasks];

    while (remaining.length > 0) {
      // Find tasks whose deps are all satisfied
      const ready = remaining.filter((t) =>
        t.dependsOn.every((dep) => completedTaskIds.has(dep))
      );

      if (ready.length === 0) {
        throw new Error(
          `Orchestrator deadlock: ${remaining.length} tasks remaining with unsatisfied deps`
        );
      }

      // Run ready tasks in parallel
      const results = await Promise.all(
        ready.map((task) => {
          const agent = agents.find((a) => a.role === task.assignedTo);
          if (!agent) {
            return Promise.resolve<TaskResult>({
              taskId: task.taskId,
              agentId: "unknown",
              role: task.assignedTo,
              output: `No agent registered for role "${task.assignedTo}"`,
              status: "failed",
            });
          }
          return this.runTask(task, agent, taskResults);
        })
      );

      for (const result of results) {
        taskResults.push(result);
        completedTaskIds.add(result.taskId);
        const idx = remaining.findIndex((t) => t.taskId === result.taskId);
        if (idx >= 0) remaining.splice(idx, 1);
      }
    }

    // Final synthesis
    const synthesis = await this.synthesize(goal, taskResults);

    return {
      goal,
      plan,
      taskResults,
      synthesis,
      totalTurns: this.totalTurns,
      completedAt: new Date().toISOString(),
    };
  }

  // ── Planning agent ─────────────────────────────────────────────────────────

  private async plan(goal: string, agents: AgentSpec[]): Promise<OrchestrationPlan> {
    const roles = [...new Set(agents.map((a) => a.role))].join(", ");

    const systemPrompt = [
      "You are a planning agent. Given a goal and available agent roles, produce a structured task plan.",
      `Available roles: ${roles}`,
      "Return ONLY valid JSON matching this shape:",
      '{"tasks":[{"taskId":"t1","description":"...","assignedTo":"executor","dependsOn":[]}]}',
      "Use short taskIds like t1, t2. Keep tasks focused and atomic.",
      "Maximize parallelism — only add dependsOn when genuinely sequential.",
    ].join("\n");

    const response = await this.engine.call({
      systemPrompt,
      messages: [{ role: "user", content: `Goal: ${goal}` }],
      tools: [],
      maxTokens: 1024,
    });

    this.totalTurns++;

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      const json = extractJSON(text);
      return { goal, tasks: json.tasks };
    } catch {
      // Fallback: single executor task
      return {
        goal,
        tasks: [
          {
            taskId: "t1",
            description: goal,
            assignedTo: "executor",
            dependsOn: [],
          },
        ],
      };
    }
  }

  // ── Task execution by agent ────────────────────────────────────────────────

  private async runTask(
    task: { taskId: string; description: string; assignedTo: AgentRole },
    agent: AgentSpec,
    priorResults: TaskResult[]
  ): Promise<TaskResult> {
    const providerCfg = resolveProvider({
      provider: this.config.settings.provider,
      model: agent.model ?? this.config.settings.model,
      env: process.env as any,
    });
    const agentEngine = new QueryEngine(providerCfg);

    const context =
      priorResults.length > 0
        ? `\n\nContext from prior tasks:\n${priorResults
            .map((r) => `[${r.taskId}] ${r.output.slice(0, 500)}`)
            .join("\n\n")}`
        : "";

    const systemPrompt =
      agent.systemPromptOverride ?? buildRolePrompt(agent.role);

    const availableTools = agent.tools
      ? this.config.tools.filter((t) => agent.tools!.includes(t.name))
      : this.config.tools;

    let lastOutput = "";
    let status: TaskResult["status"] = "done";
    let retries = 0;

    while (retries <= (this.config.maxRetries ?? 2)) {
      const response = await agentEngine.call({
        systemPrompt,
        messages: [
          {
            role: "user",
            content: `Task: ${task.description}${context}`,
          },
        ],
        tools: availableTools,
        maxTokens: this.config.settings.maxTokens ?? 2048,
      });

      this.totalTurns++;

      lastOutput = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n\n");

      // Reviewer check (if a reviewer agent is available)
      status = "done";
      break;
    }

    return {
      taskId: task.taskId,
      agentId: agent.id,
      role: agent.role,
      output: lastOutput,
      status,
    };
  }

  // ── Synthesis ──────────────────────────────────────────────────────────────

  private async synthesize(goal: string, results: TaskResult[]): Promise<string> {
    const systemPrompt =
      "You are a synthesis agent. Combine the outputs from multiple agent tasks " +
      "into a single coherent, well-structured final answer. Remove redundancy. Be concise.";

    const body = results
      .map((r) => `### Task ${r.taskId} (${r.role})\n${r.output}`)
      .join("\n\n---\n\n");

    const response = await this.engine.call({
      systemPrompt,
      messages: [
        {
          role: "user",
          content: `Goal: ${goal}\n\nAgent outputs:\n${body}`,
        },
      ],
      tools: [],
      maxTokens: 2048,
    });

    this.totalTurns++;

    return response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n\n");
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildRolePrompt(role: AgentRole): string {
  const prompts: Record<AgentRole, string> = {
    planner:
      "You are a planner. Break down goals into discrete, actionable tasks.",
    executor:
      "You are an executor agent. Complete the assigned task thoroughly using available tools.",
    reviewer:
      "You are a reviewer. Critically evaluate the output and identify errors or gaps.",
    synthesizer:
      "You are a synthesizer. Combine multiple outputs into one coherent, concise answer.",
    critic:
      "You are a critic. Challenge assumptions and identify weaknesses in the proposed approach.",
  };
  return prompts[role];
}

function extractJSON(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found");
  return JSON.parse(match[0]);
}
