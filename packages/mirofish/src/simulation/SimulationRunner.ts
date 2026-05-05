import { randomUUID } from "node:crypto";
import { queryLoop } from "@cowork/core";
import type { QueryEngine, ToolDefinition } from "@cowork/core";
import { SimAgent } from "../agents/SimAgent.js";
import type { SimAgentMessage } from "../agents/SimAgent.js";
import type { SimulationConfig, SimulationResult, RoundResult } from "./types.js";
import type { WikiStore } from "@cowork/wiki";

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
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let round = 1; round <= config.rounds; round++) {
      const roundStart = Date.now();
      const priorMessages: SimAgentMessage[] = allRounds.flatMap((r) => r.messages);

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
    priorMessages: SimAgentMessage[],
    concurrency: number
  ) {
    const results: SimAgentMessage[] = [];
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
        r.messages.map((m) => `[Round ${r.round}] ${m.agentName}: ${m.content}`)
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
          inputTokens = event.usage?.inputTokens ?? 0;
          outputTokens = event.usage?.outputTokens ?? 0;
        }
      }
    } catch {
      text = `Simulation "${config.name}" completed with ${rounds.length} rounds and ${rounds.flatMap((r) => r.messages).length} total messages.`;
    }

    return { text, inputTokens, outputTokens };
  }
}
