import type {
  SimulationConfig,
  SimulationState,
  SimAgent,
  SimAction,
  ActionType,
} from "./types";
import { QueryEngine, resolveProvider } from "@cowork/core";
import { AgentFactory } from "./AgentFactory";
import { randomUUID } from "node:crypto";

const ACTIONS_BY_PLATFORM: Record<string, ActionType[]> = {
  twitter: ["post", "reply", "like", "repost", "follow", "ignore", "disagree", "endorse"],
  reddit: ["post", "reply", "like", "question", "disagree", "ignore", "endorse"],
  slack: ["post", "reply", "like", "question", "ignore", "endorse"],
  neutral: ["post", "reply", "question", "disagree", "endorse", "ignore"],
};

export class SimulationEngine {
  private config: SimulationConfig;
  private engine: QueryEngine;
  private factory: AgentFactory;
  state: SimulationState;

  constructor(config: SimulationConfig) {
    this.config = {
      ...config,
    };

    // Set defaults if not provided
    if (this.config.agentCount === undefined) this.config.agentCount = 20;
    if (this.config.rounds === undefined) this.config.rounds = 10;
    if (this.config.concurrency === undefined) this.config.concurrency = 4;
    if (this.config.platform === undefined) this.config.platform = "neutral";

    // Clamp to safety limits
    this.config.agentCount = Math.min(this.config.agentCount, 100);
    this.config.rounds = Math.min(this.config.rounds, 40);
    this.config.concurrency = Math.min(this.config.concurrency, 8);

    const providerCfg = resolveProvider({
      provider: config.modelProvider as any,
      model: config.model,
      env: process.env as any,
    });
    this.engine = new QueryEngine(providerCfg);
    this.factory = new AgentFactory(config);

    this.state = {
      id: randomUUID(),
      config: this.config,
      agents: [],
      actions: [],
      round: 0,
      status: "idle",
    };
  }

  // ── Main simulation entry point ────────────────────────────────────────────

  async run(
    onRoundComplete?: (round: number, actions: SimAction[]) => void
  ): Promise<SimulationState> {
    this.state.status = "running";
    this.state.startedAt = new Date().toISOString();

    try {
      // Phase 1: Spawn agents
      if (this.config.verbose) console.error(`[MiroFish] Generating ${this.config.agentCount} agents…`);
      this.state.agents = await this.factory.generateAgents(
        this.config.seedDocument,
        this.config.agentCount
      );

      // Phase 2: Simulate rounds
      for (let round = 1; round <= this.config.rounds; round++) {
        this.state.round = round;
        if (this.config.verbose) console.error(`[MiroFish] Round ${round}/${this.config.rounds}`);

        const roundActions = await this.simulateRound(round);
        this.state.actions.push(...roundActions);

        // Update agent beliefs based on their network actions this round
        this.propagateBeliefs(roundActions);

        if (onRoundComplete) onRoundComplete(round, roundActions);
      }

      this.state.status = "done";
    } catch (err) {
      this.state.status = "failed";
      this.state.error = err instanceof Error ? err.message : String(err);
    }

    this.state.completedAt = new Date().toISOString();
    return this.state;
  }

  // ── Simulate one round for all agents ────────────────────────────────────

  private async simulateRound(round: number): Promise<SimAction[]> {
    const actions: SimAction[] = [];
    const agents = this.state.agents.filter((a) => a.personality !== "lurker" || Math.random() > 0.7);

    // Batch into concurrency-limited chunks
    for (let i = 0; i < agents.length; i += this.config.concurrency) {
      const batch = agents.slice(i, i + this.config.concurrency);
      const batchActions = await Promise.all(
        batch.map((agent) => this.agentTurn(agent, round))
      );
      for (const a of batchActions) {
        if (a) actions.push(a);
      }
    }

    return actions;
  }

  // ── Single agent turn ──────────────────────────────────────────────────────

  private async agentTurn(agent: SimAgent, round: number): Promise<SimAction | null> {
    const availableActions = ACTIONS_BY_PLATFORM[this.config.platform] ?? ACTIONS_BY_PLATFORM.neutral;

    // Pick a potential target (someone the agent follows or a random agent)
    const targets = [
      ...agent.following.map((id) => this.state.agents.find((a) => a.id === id)),
      ...this.state.agents.filter(() => Math.random() > 0.7),
    ].filter(Boolean) as SimAgent[];
    const target = targets[Math.floor(Math.random() * targets.length)];

    // Recent context: last 3 actions by followed agents
    const recentContext = this.state.actions
      .filter(
        (a) =>
          a.round >= round - 2 &&
          (agent.following.includes(a.agentId) || a.agentId === agent.id)
      )
      .slice(-5)
      .map((a) => `${this.agentName(a.agentId)}: ${a.content}`)
      .join("\n");

    const systemPrompt = [
      `You are ${agent.name}, a ${agent.personality} in an AI social simulation.`,
      `Bio: ${agent.bio}`,
      `Current belief in the scenario: ${(agent.beliefScore * 100).toFixed(0)}% positive.`,
      `Platform: ${this.config.platform}. Round: ${round}.`,
      `Respond in character. Be concise (1–3 sentences max).`,
      `Return JSON: {"action":"${availableActions.join("|")}","content":"your message or action description","beliefDelta":-0.2 to 0.2}`,
      "beliefDelta: how this interaction changed your belief.",
    ].join("\n");

    const userMsg = [
      `Original scenario: ${this.config.seedDocument.slice(0, 400)}`,
      `Question to predict: ${this.config.scenarioPrompt}`,
      recentContext ? `\nRecent activity in your network:\n${recentContext}` : "",
      target ? `\nYou're considering interacting with ${target.name} (${target.personality}).` : "",
      "What do you do this round?",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await this.engine.call({
        systemPrompt,
        messages: [{ role: "user", content: userMsg }],
        tools: [],
        maxTokens: 256,
      });

      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");

      const match = text.match(/\{[\s\S]*?\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]);
      const action: SimAction = {
        agentId: agent.id,
        round,
        action: (parsed.action ?? "post") as ActionType,
        targetAgentId: target?.id,
        content: parsed.content ?? "(no action)",
        timestamp: new Date().toISOString(),
        beliefDelta: Math.min(0.2, Math.max(-0.2, parsed.beliefDelta ?? 0)),
      };

      // Update agent memory
      agent.memory = [...agent.memory.slice(-4), action.content];
      return action;
    } catch {
      return null;
    }
  }

  // ── Belief propagation ─────────────────────────────────────────────────────

  private propagateBeliefs(actions: SimAction[]): void {
    for (const action of actions) {
      const agent = this.state.agents.find((a) => a.id === action.agentId);
      if (!agent) continue;

      // Direct belief update
      agent.beliefScore = Math.min(1, Math.max(0, agent.beliefScore + action.beliefDelta));

      // Influence propagation: followers absorb 30% of influencer's delta
      if (agent.influenceScore > 0.6) {
        for (const followerId of agent.followedBy) {
          const follower = this.state.agents.find((a) => a.id === followerId);
          if (follower) {
            follower.beliefScore = Math.min(
              1,
              Math.max(0, follower.beliefScore + action.beliefDelta * 0.3)
            );
          }
        }
      }
    }
  }

  private agentName(id: string): string {
    return this.state.agents.find((a) => a.id === id)?.name ?? id;
  }
}
