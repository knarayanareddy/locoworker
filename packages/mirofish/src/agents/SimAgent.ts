import { randomUUID } from "node:crypto";
import { queryLoop } from "@cowork/core";
import type { QueryEngine, ToolDefinition, AgentPolicy } from "@cowork/core";

export interface SimAgentConfig {
  id?: string;
  name: string;
  role: string;
  systemPrompt: string;
  engine: QueryEngine;
  tools?: ToolDefinition[];
  policy?: AgentPolicy;
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
  private policy?: AgentPolicy;
  private memory: SimAgentMessage[] = [];

  constructor(config: SimAgentConfig) {
    this.id = config.id ?? randomUUID();
    this.name = config.name;
    this.role = config.role;
    this.systemPrompt = config.systemPrompt;
    this.engine = config.engine;
    this.tools = config.tools ?? [];
    this.policy = config.policy;
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
        maxTokens: 500,
        policy: this.policy,
      })) {
        if (event.type === "complete") content = event.text;
        if (event.type === "complete") {
          inputTokens = event.usage?.inputTokens ?? 0;
          outputTokens = event.usage?.outputTokens ?? 0;
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
