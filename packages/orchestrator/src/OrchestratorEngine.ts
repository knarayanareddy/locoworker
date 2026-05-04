import type { OrchestratorConfig, OrchestratorPlan, AgentRole } from "./types";
import {
  QueryEngine,
  resolveProvider,
  queryLoop,
  type AgentEvent,
  type ProviderName,
} from "@cowork/core";

export class OrchestratorEngine {
  private config: Required<OrchestratorConfig>;

  constructor(config: OrchestratorConfig) {
    this.config = {
      maxParallelTasks: 1,
      apiKey: undefined,
      baseUrl: undefined,
      ...config,
    } as Required<OrchestratorConfig>;
  }

  async run(goal: string): Promise<string> {
    // 1. Plan
    const plan = await this.createPlan(goal);

    // 2. Execute tasks sequentially (simplification for Phase 3)
    for (const task of plan.tasks) {
      task.status = "running";
      try {
        task.result = await this.executeTask(task, plan);
        task.status = "completed";
      } catch (err) {
        task.status = "failed";
        task.result = err instanceof Error ? err.message : String(err);
        break; // abort on failure
      }
    }

    // 3. Synthesize
    return await this.synthesize(goal, plan);
  }

  private async createPlan(goal: string): Promise<OrchestratorPlan> {
    const engine = this.getEngine();
    const system =
      "You are a task planner. Break down the goal into a series of tasks. " +
      "Return a JSON object: { \"tasks\": [ { \"id\": \"T1\", \"description\": \"...\", \"dependencies\": [], \"assignedRole\": \"executor\" } ] }";

    const response = await engine.call({
      systemPrompt: system,
      messages: [{ role: "user", content: `Goal: ${goal}` }],
      tools: [],
    });
    
    const text = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");

    // Pragmatic JSON extraction
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Planner failed to return JSON plan");
    
    const data = JSON.parse(jsonMatch[0]);
    return { goal, tasks: data.tasks };
  }

  private async executeTask(task: any, plan: OrchestratorPlan): Promise<string> {
    const prompt = `Task: ${task.description}\nContext: ${JSON.stringify(plan.tasks.filter(t => t.status === "completed"))}`;
    const system = `You are an agent with role: ${task.assignedRole}. Complete the task efficiently.`;

    let result = "";
    for await (const event of queryLoop(prompt, {
      engine: this.getEngine(),
      tools: this.config.tools,
      systemPrompt: system,
      workingDirectory: this.config.projectRoot,
      permissionLevel: 2, // STANDARD
      maxTurns: 5,
    })) {
      if (event.type === "text") result += (event as any).text;
    }
    return result;
  }

  private async synthesize(goal: string, plan: OrchestratorPlan): Promise<string> {
    const engine = this.getEngine();
    const system = "You are a synthesizer. Combine the task results into a final answer for the goal.";
    const user = `Goal: ${goal}\nResults:\n${plan.tasks.map(t => `- ${t.description}: ${t.result}`).join("\n")}`;

    const response = await engine.call({
      systemPrompt: system,
      messages: [{ role: "user", content: user }],
      tools: [],
    });

    return response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");
  }

  private getEngine(): QueryEngine {
    const provider = resolveProvider({
      provider: this.config.provider as ProviderName,
      model: this.config.model,
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      env: process.env,
    });
    return new QueryEngine(provider);
  }
}
