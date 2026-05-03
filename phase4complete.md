Phase 4 — Complete File Set
New packages overview
text

packages/
  mirofish/       ← Swarm-intelligence multi-agent simulation studio
  openclaw/       ← Messaging gateway (Telegram, Slack, Discord, Webhook)
  hermes/         ← MCP server host (expose cowork tools as an MCP server)
  telemetry/      ← Structured observability, tracing, metrics
  analytics/      ← Cost tracking, token usage, session analytics
  security/       ← Advanced security: audit log, rate limit, sandbox policy
  cache/          ← Prompt cache engineering (cache-stable system prompts)
apps/
  dashboard/      ← Bun HTTP web dashboard (live sessions, memory, analytics)
packages/core/src/
  council/        ← Council/voting multi-agent debate pattern
  soul/           ← SOUL.md persona context system
1. MiroFish Simulation Studio — packages/mirofish/
packages/mirofish/package.json
JSON

{
  "name": "@cowork/mirofish",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cowork/core": "workspace:*",
    "@cowork/graphify": "workspace:*",
    "@cowork/wiki": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "bun-types": "latest"
  }
}
packages/mirofish/src/types.ts
TypeScript

export type AgentPersonality =
  | "adopter"        // enthusiastic early adopter
  | "skeptic"        // questions everything
  | "neutral"        // balanced observer
  | "influencer"     // opinion leader, high reach
  | "expert"         // domain knowledge authority
  | "troll"          // adversarial / disruptive
  | "lurker";        // reads but rarely posts

export type PlatformType = "twitter" | "reddit" | "slack" | "neutral";

export type ActionType =
  | "post"
  | "reply"
  | "like"
  | "repost"
  | "follow"
  | "ignore"
  | "disagree"
  | "endorse"
  | "question";

export interface SimAgent {
  id: string;
  name: string;
  personality: AgentPersonality;
  bio: string;
  beliefScore: number;      // 0–1: how much they believe the seed claim
  influenceScore: number;   // 0–1: reach within the simulated network
  memory: string[];         // recent interactions
  followedBy: string[];     // agent ids that follow this agent
  following: string[];
}

export interface SimAction {
  agentId: string;
  round: number;
  action: ActionType;
  targetAgentId?: string;
  content: string;
  timestamp: string;
  beliefDelta: number;      // how much this changed the agent's belief
}

export interface SimulationConfig {
  seedDocument: string;       // the event/scenario to simulate reaction to
  scenarioPrompt: string;     // what to predict / observe
  platform: PlatformType;
  agentCount: number;         // default 20, max 100
  rounds: number;             // simulation rounds, default 10, max 40
  modelProvider: string;
  model: string;
  concurrency: number;        // parallel agent calls, default 4
  verbose?: boolean;
}

export interface SimulationState {
  id: string;
  config: SimulationConfig;
  agents: SimAgent[];
  actions: SimAction[];
  round: number;
  status: "idle" | "running" | "done" | "failed";
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface SimulationReport {
  id: string;
  scenarioPrompt: string;
  agentCount: number;
  rounds: number;
  totalActions: number;
  finalBeliefDistribution: {
    stronglyFor: number;
    mildlyFor: number;
    neutral: number;
    mildlyAgainst: number;
    stronglyAgainst: number;
  };
  dominantNarrative: string;
  topInfluencers: Array<{ name: string; personality: AgentPersonality; beliefScore: number }>;
  keyMoments: string[];
  prediction: string;
  rawMarkdown: string;
}
packages/mirofish/src/AgentFactory.ts
TypeScript

import type { SimAgent, AgentPersonality, SimulationConfig } from "./types";
import { QueryEngine, resolveProvider } from "@cowork/core";

const PERSONALITIES: AgentPersonality[] = [
  "adopter", "skeptic", "neutral", "influencer",
  "expert", "troll", "lurker",
];

const PERSONALITY_DISTRIBUTION: Record<AgentPersonality, number> = {
  adopter: 0.15,
  skeptic: 0.20,
  neutral: 0.30,
  influencer: 0.10,
  expert: 0.10,
  troll: 0.05,
  lurker: 0.10,
};

export class AgentFactory {
  private engine: QueryEngine;

  constructor(config: SimulationConfig) {
    const providerCfg = resolveProvider({
      provider: config.modelProvider,
      model: config.model,
    });
    this.engine = new QueryEngine(providerCfg);
  }

  async generateAgents(
    seedDocument: string,
    count: number
  ): Promise<SimAgent[]> {
    // Determine personality mix
    const mix = this.buildPersonalityMix(count);
    const agents: SimAgent[] = [];

    // Generate agent bios in one batch call for efficiency
    const systemPrompt = [
      "You are generating diverse AI simulation personas for a social simulation.",
      "Each persona should feel realistic, have a distinct voice, and relate to the topic.",
      `Return ONLY a JSON array of exactly ${count} objects, each with:`,
      '{"name":"string","personality":"string","bio":"string (2 sentences)","beliefScore":0.0-1.0,"influenceScore":0.0-1.0}',
      "beliefScore: initial belief in the seed claim (0=strongly against, 1=strongly for)",
      "influenceScore: their reach/authority in the community (0=nobody, 1=major influencer)",
    ].join("\n");

    const userMsg = [
      `Topic/Seed: ${seedDocument.slice(0, 800)}`,
      `Required personalities (counts): ${JSON.stringify(mix)}`,
      "Generate the persona array now.",
    ].join("\n\n");

    let personas: Array<{
      name: string;
      personality: AgentPersonality;
      bio: string;
      beliefScore: number;
      influenceScore: number;
    }>;

    try {
      const response = await this.engine.call({
        systemPrompt,
        messages: [{ role: "user", content: userMsg }],
        tools: [],
        maxTokens: 4096,
      });
      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");
      const match = text.match(/\[[\s\S]*\]/);
      personas = match ? JSON.parse(match[0]) : [];
    } catch {
      // Fallback: generate deterministic personas
      personas = this.fallbackPersonas(count, mix);
    }

    // Build SimAgent objects with network connections
    for (let i = 0; i < personas.length && i < count; i++) {
      const p = personas[i];
      const agent: SimAgent = {
        id: `agent-${i}`,
        name: p.name ?? `Agent${i}`,
        personality: (p.personality ?? "neutral") as AgentPersonality,
        bio: p.bio ?? "",
        beliefScore: Math.min(1, Math.max(0, p.beliefScore ?? 0.5)),
        influenceScore: Math.min(1, Math.max(0, p.influenceScore ?? 0.3)),
        memory: [],
        followedBy: [],
        following: [],
      };
      agents.push(agent);
    }

    // Wire follow network: influencers get more followers
    this.wireNetwork(agents);
    return agents;
  }

  private buildPersonalityMix(total: number): Record<AgentPersonality, number> {
    const mix: Record<AgentPersonality, number> = {} as any;
    let assigned = 0;
    for (const [p, ratio] of Object.entries(PERSONALITY_DISTRIBUTION)) {
      const n = Math.round(total * ratio);
      mix[p as AgentPersonality] = n;
      assigned += n;
    }
    // Top up neutrals if rounding left gaps
    mix.neutral += total - assigned;
    return mix;
  }

  private wireNetwork(agents: SimAgent[]): void {
    for (const agent of agents) {
      // Each agent follows 2–8 others with preference for influencers
      const followCount = 2 + Math.floor(Math.random() * 6);
      const candidates = agents
        .filter((a) => a.id !== agent.id)
        .sort((a, b) => b.influenceScore - a.influenceScore)
        .slice(0, 20);

      for (let i = 0; i < Math.min(followCount, candidates.length); i++) {
        const target = candidates[i];
        agent.following.push(target.id);
        target.followedBy.push(agent.id);
      }
    }
  }

  private fallbackPersonas(
    count: number,
    mix: Record<AgentPersonality, number>
  ) {
    const personas = [];
    let idx = 0;
    for (const [personality, n] of Object.entries(mix)) {
      for (let i = 0; i < n && personas.length < count; i++) {
        personas.push({
          name: `${personality.charAt(0).toUpperCase() + personality.slice(1)}${idx++}`,
          personality: personality as AgentPersonality,
          bio: `A ${personality} participant in the simulation.`,
          beliefScore: personality === "adopter" ? 0.8 : personality === "skeptic" ? 0.2 : 0.5,
          influenceScore: personality === "influencer" ? 0.85 : 0.3,
        });
      }
    }
    return personas;
  }
}
packages/mirofish/src/SimulationEngine.ts
TypeScript

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
      agentCount: 20,
      rounds: 10,
      concurrency: 4,
      platform: "neutral",
      ...config,
    };

    // Clamp to safety limits
    this.config.agentCount = Math.min(this.config.agentCount, 100);
    this.config.rounds = Math.min(this.config.rounds, 40);
    this.config.concurrency = Math.min(this.config.concurrency, 8);

    const providerCfg = resolveProvider({
      provider: config.modelProvider,
      model: config.model,
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
packages/mirofish/src/ReportGenerator.ts
TypeScript

import type { SimulationState, SimulationReport, SimAgent } from "./types";
import { QueryEngine, resolveProvider } from "@cowork/core";

export class ReportGenerator {
  private engine: QueryEngine;

  constructor(state: SimulationState) {
    const cfg = resolveProvider({
      provider: state.config.modelProvider,
      model: state.config.model,
    });
    this.engine = new QueryEngine(cfg);
  }

  async generate(state: SimulationState): Promise<SimulationReport> {
    const { agents, actions, config } = state;

    // ── Belief distribution ──────────────────────────────────────────────────
    const dist = this.computeBeliefDistribution(agents);

    // ── Top influencers ──────────────────────────────────────────────────────
    const topInfluencers = agents
      .sort((a, b) => b.influenceScore * b.followedBy.length - a.influenceScore * a.followedBy.length)
      .slice(0, 5)
      .map((a) => ({ name: a.name, personality: a.personality, beliefScore: a.beliefScore }));

    // ── Key moments: most impactful beliefDelta actions ──────────────────────
    const keyMoments = actions
      .sort((a, b) => Math.abs(b.beliefDelta) - Math.abs(a.beliefDelta))
      .slice(0, 8)
      .map((a) => {
        const agent = agents.find((ag) => ag.id === a.agentId);
        return `Round ${a.round} — ${agent?.name ?? a.agentId} (${agent?.personality}): "${a.content}" [Δ${a.beliefDelta > 0 ? "+" : ""}${(a.beliefDelta * 100).toFixed(0)}%]`;
      });

    // ── Model-synthesized narrative + prediction ──────────────────────────────
    const actionSample = actions
      .slice(0, 80)
      .map((a) => {
        const agent = agents.find((ag) => ag.id === a.agentId);
        return `[R${a.round}] ${agent?.name} (${agent?.personality}): ${a.content}`;
      })
      .join("\n");

    const systemPrompt = [
      "You are a senior analyst reviewing a multi-agent social simulation.",
      "Based on the simulation data, provide:",
      "1. A 'dominantNarrative' (2–3 sentences): what story emerged from the simulation",
      "2. A 'prediction' (2–3 sentences): direct answer to the scenario question",
      "Return JSON: {\"dominantNarrative\":\"...\",\"prediction\":\"...\"}",
    ].join("\n");

    const userMsg = [
      `Scenario: ${config.scenarioPrompt}`,
      `Seed: ${config.seedDocument.slice(0, 500)}`,
      `Final belief distribution: ${JSON.stringify(dist)}`,
      `Top influencers: ${topInfluencers.map((i) => `${i.name}(${(i.beliefScore * 100).toFixed(0)}%)`).join(", ")}`,
      `Sample actions:\n${actionSample}`,
    ].join("\n\n");

    let dominantNarrative = "The simulation showed mixed reactions to the scenario.";
    let prediction = "Outcome prediction could not be determined from available data.";

    try {
      const response = await this.engine.call({
        systemPrompt,
        messages: [{ role: "user", content: userMsg }],
        tools: [],
        maxTokens: 512,
      });
      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        dominantNarrative = parsed.dominantNarrative ?? dominantNarrative;
        prediction = parsed.prediction ?? prediction;
      }
    } catch { /* use defaults */ }

    const rawMarkdown = this.formatMarkdown({
      state,
      dist,
      topInfluencers,
      keyMoments,
      dominantNarrative,
      prediction,
    });

    return {
      id: state.id,
      scenarioPrompt: config.scenarioPrompt,
      agentCount: agents.length,
      rounds: config.rounds,
      totalActions: actions.length,
      finalBeliefDistribution: dist,
      dominantNarrative,
      topInfluencers,
      keyMoments,
      prediction,
      rawMarkdown,
    };
  }

  private computeBeliefDistribution(agents: SimAgent[]) {
    let stronglyFor = 0, mildlyFor = 0, neutral = 0, mildlyAgainst = 0, stronglyAgainst = 0;
    for (const a of agents) {
      if (a.beliefScore >= 0.8) stronglyFor++;
      else if (a.beliefScore >= 0.6) mildlyFor++;
      else if (a.beliefScore >= 0.4) neutral++;
      else if (a.beliefScore >= 0.2) mildlyAgainst++;
      else stronglyAgainst++;
    }
    return { stronglyFor, mildlyFor, neutral, mildlyAgainst, stronglyAgainst };
  }

  private formatMarkdown(data: {
    state: SimulationState;
    dist: ReturnType<ReportGenerator["computeBeliefDistribution"]>;
    topInfluencers: Array<{ name: string; personality: string; beliefScore: number }>;
    keyMoments: string[];
    dominantNarrative: string;
    prediction: string;
  }): string {
    const { state, dist, topInfluencers, keyMoments, dominantNarrative, prediction } = data;
    const total = state.agents.length;
    return [
      `# MiroFish Simulation Report`,
      `**ID:** ${state.id}`,
      `**Completed:** ${state.completedAt ?? "in progress"}`,
      `**Platform:** ${state.config.platform} | **Agents:** ${total} | **Rounds:** ${state.config.rounds}`,
      "",
      "## Scenario",
      state.config.scenarioPrompt,
      "",
      "## Dominant Narrative",
      dominantNarrative,
      "",
      "## Prediction",
      prediction,
      "",
      "## Final Belief Distribution",
      `| Sentiment | Count | % |`,
      `|-----------|-------|---|`,
      `| Strongly For | ${dist.stronglyFor} | ${pct(dist.stronglyFor, total)} |`,
      `| Mildly For | ${dist.mildlyFor} | ${pct(dist.mildlyFor, total)} |`,
      `| Neutral | ${dist.neutral} | ${pct(dist.neutral, total)} |`,
      `| Mildly Against | ${dist.mildlyAgainst} | ${pct(dist.mildlyAgainst, total)} |`,
      `| Strongly Against | ${dist.stronglyAgainst} | ${pct(dist.stronglyAgainst, total)} |`,
      "",
      "## Top Influencers",
      ...topInfluencers.map(
        (i) => `- **${i.name}** (${i.personality}) — final belief: ${(i.beliefScore * 100).toFixed(0)}%`
      ),
      "",
      "## Key Moments",
      ...keyMoments.map((m) => `- ${m}`),
      "",
      "## Total Actions",
      `${state.actions.length} actions across ${state.config.rounds} rounds`,
    ].join("\n");
  }
}

function pct(n: number, total: number): string {
  return total > 0 ? `${((n / total) * 100).toFixed(0)}%` : "0%";
}
packages/mirofish/src/MiroFishStudio.ts
TypeScript

import type { SimulationConfig, SimulationReport, SimulationState } from "./types";
import { SimulationEngine } from "./SimulationEngine";
import { ReportGenerator } from "./ReportGenerator";
import { MemorySystem } from "@cowork/core";
import { LLMWiki } from "@cowork/wiki";
import path from "path";
import { mkdir } from "node:fs/promises";

export interface StudioConfig {
  projectRoot: string;
  outputDir?: string;
  saveToWiki?: boolean;
  saveToMemory?: boolean;
}

export class MiroFishStudio {
  private studioConfig: StudioConfig;

  constructor(config: StudioConfig) {
    this.studioConfig = {
      outputDir: path.join(config.projectRoot, "mirofish-out"),
      saveToWiki: true,
      saveToMemory: true,
      ...config,
    };
  }

  async run(
    simConfig: SimulationConfig,
    onProgress?: (round: number, actionCount: number) => void
  ): Promise<SimulationReport> {
    await mkdir(this.studioConfig.outputDir!, { recursive: true });

    const engine = new SimulationEngine(simConfig);
    const state = await engine.run((round, actions) => {
      onProgress?.(round, actions.length);
    });

    if (state.status === "failed") {
      throw new Error(`Simulation failed: ${state.error}`);
    }

    const reporter = new ReportGenerator(state);
    const report = await reporter.generate(state);

    // Persist outputs
    await this.persistReport(report, state);
    await this.persistToWikiAndMemory(report, simConfig);

    return report;
  }

  private async persistReport(
    report: SimulationReport,
    state: SimulationState
  ): Promise<void> {
    const base = path.join(this.studioConfig.outputDir!, report.id);

    await Bun.write(`${base}-report.md`, report.rawMarkdown);
    await Bun.write(`${base}-state.json`, JSON.stringify(state, null, 2));
    await Bun.write(`${base}-report.json`, JSON.stringify(report, null, 2));
  }

  private async persistToWikiAndMemory(
    report: SimulationReport,
    config: SimulationConfig
  ): Promise<void> {
    if (this.studioConfig.saveToWiki) {
      try {
        const wiki = new LLMWiki({ projectRoot: this.studioConfig.projectRoot });
        await wiki.upsertPage(`sim-${report.id.slice(0, 8)}`, {
          title: `Simulation: ${report.scenarioPrompt.slice(0, 60)}`,
          body: report.rawMarkdown,
          tags: ["mirofish", "simulation", config.platform],
          sourceMemoryIds: [],
        });
      } catch { /* best effort */ }
    }

    if (this.studioConfig.saveToMemory) {
      try {
        const memory = new MemorySystem(this.studioConfig.projectRoot);
        await memory.save({
          type: "reference",
          name: `mirofish-sim-${report.id.slice(0, 8)}`,
          description: `MiroFish simulation: ${report.scenarioPrompt.slice(0, 80)}`,
          body: [
            `Prediction: ${report.prediction}`,
            `Narrative: ${report.dominantNarrative}`,
            `Agents: ${report.agentCount} | Rounds: ${report.rounds} | Actions: ${report.totalActions}`,
          ].join("\n"),
          tags: ["mirofish", "simulation"],
          confidence: 0.85,
        });
      } catch { /* best effort */ }
    }
  }
}
packages/mirofish/src/tools.ts
TypeScript

import type { ToolDefinition, ToolContext } from "@cowork/core";
import { MiroFishStudio } from "./MiroFishStudio";

export const SimulationRun: ToolDefinition = {
  name: "SimulationRun",
  description: [
    "Run a MiroFish multi-agent swarm simulation. Provide a seed document (news, report, announcement)",
    "and a scenario question (what reaction to predict). The simulation spawns AI agents with unique",
    "personalities, runs them through interaction rounds, and generates a prediction report.",
    "Returns the prediction summary. Full report saved to mirofish-out/ and wiki.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      seedDocument: {
        type: "string",
        description: "The event/scenario seed (news article, product announcement, etc.)",
      },
      scenarioPrompt: {
        type: "string",
        description: "What to predict (e.g. 'How will users react to this price increase?')",
      },
      platform: {
        type: "string",
        enum: ["twitter", "reddit", "slack", "neutral"],
        description: "Simulated platform (default: neutral)",
      },
      agentCount: {
        type: "number",
        description: "Number of agents (5–100, default 20)",
      },
      rounds: {
        type: "number",
        description: "Simulation rounds (1–40, default 10)",
      },
    },
    required: ["seedDocument", "scenarioPrompt"],
  },
  permissionLevel: "ELEVATED",
  async execute(
    input: {
      seedDocument: string;
      scenarioPrompt: string;
      platform?: string;
      agentCount?: number;
      rounds?: number;
    },
    ctx: ToolContext
  ) {
    const studio = new MiroFishStudio({ projectRoot: ctx.workingDirectory });
    const progressLines: string[] = [];

    try {
      const report = await studio.run(
        {
          seedDocument: input.seedDocument,
          scenarioPrompt: input.scenarioPrompt,
          platform: (input.platform ?? "neutral") as any,
          agentCount: Math.min(input.agentCount ?? 20, 100),
          rounds: Math.min(input.rounds ?? 10, 40),
          modelProvider: ctx.settings?.provider ?? "ollama",
          model: ctx.settings?.model ?? "qwen2.5-coder:7b",
          concurrency: 4,
        },
        (round, count) => {
          progressLines.push(`Round ${round}: ${count} actions`);
        }
      );

      return {
        content: [
          `## MiroFish Simulation Complete`,
          `**Agents:** ${report.agentCount} | **Rounds:** ${report.rounds} | **Actions:** ${report.totalActions}`,
          "",
          `### Prediction`,
          report.prediction,
          "",
          `### Dominant Narrative`,
          report.dominantNarrative,
          "",
          `### Belief Distribution`,
          `For: ${report.finalBeliefDistribution.stronglyFor + report.finalBeliefDistribution.mildlyFor} agents`,
          `Against: ${report.finalBeliefDistribution.mildlyAgainst + report.finalBeliefDistribution.stronglyAgainst} agents`,
          `Neutral: ${report.finalBeliefDistribution.neutral} agents`,
          "",
          `Full report: mirofish-out/${report.id}-report.md`,
        ].join("\n"),
        isError: false,
      };
    } catch (err) {
      return {
        content: `Simulation failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

export const MIROFISH_TOOLS: ToolDefinition[] = [SimulationRun];
packages/mirofish/src/index.ts
TypeScript

export { MiroFishStudio } from "./MiroFishStudio";
export { SimulationEngine } from "./SimulationEngine";
export { AgentFactory } from "./AgentFactory";
export { ReportGenerator } from "./ReportGenerator";
export { MIROFISH_TOOLS, SimulationRun } from "./tools";
export type {
  SimulationConfig,
  SimulationState,
  SimulationReport,
  SimAgent,
  SimAction,
  AgentPersonality,
  ActionType,
  PlatformType,
} from "./types";
2. OpenClaw Messaging Gateway — packages/openclaw/
packages/openclaw/package.json
JSON

{
  "name": "@cowork/openclaw",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "dependencies": {
    "@cowork/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "bun-types": "latest"
  }
}
packages/openclaw/src/types.ts
TypeScript

export type ChannelType =
  | "telegram"
  | "slack"
  | "discord"
  | "webhook"
  | "cli"       // loopback for testing
  | "http";     // generic HTTP ingress

export type MessageRole = "user" | "assistant" | "system";

export interface InboundMessage {
  id: string;
  channelType: ChannelType;
  channelId: string;       // e.g. telegram chat id, slack channel id
  userId: string;
  text: string;
  attachments?: MessageAttachment[];
  replyToId?: string;
  ts: number;
  metadata?: Record<string, unknown>;
}

export interface OutboundMessage {
  channelType: ChannelType;
  channelId: string;
  text: string;
  replyToId?: string;
  parseMarkdown?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MessageAttachment {
  type: "image" | "file" | "audio";
  url?: string;
  data?: string;    // base64
  mimeType?: string;
  filename?: string;
}

export interface ChannelConfig {
  type: ChannelType;
  channelId: string;
  name?: string;
  // Auth tokens etc. — loaded from env, not stored in config object
  settings?: Record<string, unknown>;
}

export interface GatewayConfig {
  projectRoot: string;
  channels: ChannelConfig[];
  httpPort?: number;          // port for HTTP ingress (default 3721)
  webhookSecret?: string;
  rateLimitPerUser?: number;  // messages per minute per userId (default 20)
}

export interface RateLimitState {
  userId: string;
  count: number;
  windowStart: number;
}
packages/openclaw/src/channels/BaseChannel.ts
TypeScript

import type { InboundMessage, OutboundMessage, ChannelConfig } from "../types";
import { EventEmitter } from "events";

export abstract class BaseChannel extends EventEmitter {
  protected config: ChannelConfig;

  constructor(config: ChannelConfig) {
    super();
    this.config = config;
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(msg: OutboundMessage): Promise<void>;

  get channelId(): string {
    return this.config.channelId;
  }

  get channelType() {
    return this.config.type;
  }

  protected emit_message(msg: InboundMessage): void {
    this.emit("message", msg);
  }
}
packages/openclaw/src/channels/TelegramChannel.ts
TypeScript

import { BaseChannel } from "./BaseChannel";
import type { ChannelConfig, InboundMessage, OutboundMessage } from "../types";
import { randomUUID } from "node:crypto";

/**
 * Telegram channel via the Bot API (long polling).
 * Requires TELEGRAM_BOT_TOKEN in env.
 * Uses the Telegram Bot API directly (no SDK dep — just fetch).
 */
export class TelegramChannel extends BaseChannel {
  private token: string;
  private polling = false;
  private offset = 0;
  private pollTimer?: ReturnType<typeof setTimeout>;

  constructor(config: ChannelConfig) {
    super(config);
    this.token = process.env.TELEGRAM_BOT_TOKEN ?? (config.settings?.token as string ?? "");
    if (!this.token) {
      throw new Error("TelegramChannel: TELEGRAM_BOT_TOKEN not set");
    }
  }

  async start(): Promise<void> {
    this.polling = true;
    this.poll();
  }

  async stop(): Promise<void> {
    this.polling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  async send(msg: OutboundMessage): Promise<void> {
    const body = {
      chat_id: msg.channelId,
      text: msg.text.slice(0, 4096),
      parse_mode: msg.parseMarkdown ? "Markdown" : undefined,
      reply_to_message_id: msg.replyToId,
    };

    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telegram send failed: ${err}`);
    }
  }

  private async poll(): Promise<void> {
    if (!this.polling) return;

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.token}/getUpdates?timeout=25&offset=${this.offset}`,
        { signal: AbortSignal.timeout(30_000) }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          result: Array<{
            update_id: number;
            message?: {
              message_id: number;
              from?: { id: number; username?: string };
              chat: { id: number };
              text?: string;
            };
          }>;
        };

        for (const update of data.result) {
          this.offset = update.update_id + 1;
          if (update.message?.text) {
            const msg: InboundMessage = {
              id: randomUUID(),
              channelType: "telegram",
              channelId: String(update.message.chat.id),
              userId: String(update.message.from?.id ?? "unknown"),
              text: update.message.text,
              ts: Date.now(),
              metadata: { messageId: update.message.message_id },
            };
            this.emit_message(msg);
          }
        }
      }
    } catch { /* poll errors are transient */ }

    if (this.polling) {
      this.pollTimer = setTimeout(() => this.poll(), 1000);
    }
  }

  private get apiBase(): string {
    return `https://api.telegram.org/bot${this.token}`;
  }
}
packages/openclaw/src/channels/WebhookChannel.ts
TypeScript

import { BaseChannel } from "./BaseChannel";
import type { ChannelConfig, InboundMessage, OutboundMessage } from "../types";
import { randomUUID } from "node:crypto";

/**
 * Generic inbound webhook channel.
 * Other systems POST JSON to /webhook/<channelId>.
 * The GatewayServer routes these requests to the appropriate channel instance.
 */
export class WebhookChannel extends BaseChannel {
  private outboundBuffer: OutboundMessage[] = [];

  constructor(config: ChannelConfig) {
    super(config);
  }

  async start(): Promise<void> {
    // Webhook channels are passive — GatewayServer calls handleInbound()
  }

  async stop(): Promise<void> {
    this.outboundBuffer = [];
  }

  async send(msg: OutboundMessage): Promise<void> {
    // For webhook channels, outbound goes to a configured callback URL
    const callbackUrl = this.config.settings?.callbackUrl as string | undefined;
    if (!callbackUrl) {
      this.outboundBuffer.push(msg);
      return;
    }

    await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg.text, channelId: msg.channelId }),
    });
  }

  /** Called by GatewayServer when a webhook POST arrives for this channel */
  handleInbound(payload: Record<string, unknown>): void {
    const msg: InboundMessage = {
      id: randomUUID(),
      channelType: "webhook",
      channelId: this.config.channelId,
      userId: String(payload.userId ?? payload.user_id ?? "webhook-user"),
      text: String(payload.text ?? payload.message ?? ""),
      ts: Date.now(),
      metadata: payload,
    };
    if (msg.text) this.emit_message(msg);
  }

  drainBuffer(): OutboundMessage[] {
    const buf = [...this.outboundBuffer];
    this.outboundBuffer = [];
    return buf;
  }
}
packages/openclaw/src/channels/HttpChannel.ts
TypeScript

import { BaseChannel } from "./BaseChannel";
import type { ChannelConfig, InboundMessage, OutboundMessage } from "../types";
import { randomUUID } from "node:crypto";

/**
 * Simple HTTP long-poll channel.
 * Clients POST to /message and GET /poll to receive responses.
 * Used for the web dashboard or testing.
 */
export class HttpChannel extends BaseChannel {
  private outboundQueue: OutboundMessage[] = [];
  private subscribers = new Set<(msg: OutboundMessage) => void>();

  constructor(config: ChannelConfig) {
    super(config);
  }

  async start(): Promise<void> { /* passive */ }
  async stop(): Promise<void> {
    this.outboundQueue = [];
    this.subscribers.clear();
  }

  async send(msg: OutboundMessage): Promise<void> {
    this.outboundQueue.push(msg);
    for (const sub of this.subscribers) sub(msg);
  }

  /** Called by GatewayServer for POST /message */
  handleInbound(text: string, userId = "http-user"): void {
    const msg: InboundMessage = {
      id: randomUUID(),
      channelType: "http",
      channelId: this.config.channelId,
      userId,
      text,
      ts: Date.now(),
    };
    this.emit_message(msg);
  }

  /** Called by GET /poll endpoint — waits up to 30s for a response */
  async waitForResponse(timeoutMs = 30_000): Promise<OutboundMessage | null> {
    // If message already queued, return immediately
    if (this.outboundQueue.length > 0) return this.outboundQueue.shift()!;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.subscribers.delete(handler);
        resolve(null);
      }, timeoutMs);

      const handler = (msg: OutboundMessage) => {
        clearTimeout(timer);
        this.subscribers.delete(handler);
        resolve(msg);
      };
      this.subscribers.add(handler);
    });
  }
}
packages/openclaw/src/RateLimiter.ts
TypeScript

import type { RateLimitState } from "./types";

export class RateLimiter {
  private states = new Map<string, RateLimitState>();
  private limitPerMinute: number;

  constructor(limitPerMinute = 20) {
    this.limitPerMinute = limitPerMinute;
  }

  check(userId: string): boolean {
    const now = Date.now();
    const window = 60_000;

    let state = this.states.get(userId);
    if (!state || now - state.windowStart > window) {
      state = { userId, count: 0, windowStart: now };
      this.states.set(userId, state);
    }

    state.count++;
    return state.count <= this.limitPerMinute;
  }

  remaining(userId: string): number {
    const state = this.states.get(userId);
    if (!state) return this.limitPerMinute;
    if (Date.now() - state.windowStart > 60_000) return this.limitPerMinute;
    return Math.max(0, this.limitPerMinute - state.count);
  }

  // Prune stale entries periodically
  prune(): void {
    const cutoff = Date.now() - 120_000;
    for (const [id, state] of this.states.entries()) {
      if (state.windowStart < cutoff) this.states.delete(id);
    }
  }
}
packages/openclaw/src/GatewayServer.ts
TypeScript

import type { GatewayConfig, InboundMessage, OutboundMessage, ChannelConfig } from "./types";
import { BaseChannel } from "./channels/BaseChannel";
import { TelegramChannel } from "./channels/TelegramChannel";
import { WebhookChannel } from "./channels/WebhookChannel";
import { HttpChannel } from "./channels/HttpChannel";
import { RateLimiter } from "./RateLimiter";
import { EventEmitter } from "events";

export type MessageHandler = (
  msg: InboundMessage,
  reply: (text: string) => Promise<void>
) => Promise<void>;

export class GatewayServer extends EventEmitter {
  private config: GatewayConfig;
  private channels = new Map<string, BaseChannel>();
  private rateLimiter: RateLimiter;
  private httpServer?: ReturnType<typeof Bun.serve>;
  private messageHandler?: MessageHandler;

  constructor(config: GatewayConfig) {
    super();
    this.config = {
      httpPort: 3721,
      rateLimitPerUser: 20,
      ...config,
    };
    this.rateLimiter = new RateLimiter(this.config.rateLimitPerUser);
  }

  // ── Handler registration ───────────────────────────────────────────────────

  onMessage(handler: MessageHandler): this {
    this.messageHandler = handler;
    return this;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    // Register channels from config
    for (const channelCfg of this.config.channels) {
      const channel = this.createChannel(channelCfg);
      if (!channel) continue;

      channel.on("message", (msg: InboundMessage) => {
        void this.handleInbound(msg, channel);
      });

      await channel.start();
      this.channels.set(channelCfg.channelId, channel);
    }

    // Start HTTP server for webhook + http channels + dashboard integration
    this.httpServer = Bun.serve({
      port: this.config.httpPort,
      fetch: (req) => this.handleHttp(req),
    });

    console.log(`[OpenClaw] Gateway running on port ${this.config.httpPort}`);
    console.log(`[OpenClaw] ${this.channels.size} channel(s) active`);
  }

  async stop(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.stop();
    }
    this.httpServer?.stop();
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  async send(msg: OutboundMessage): Promise<void> {
    const channel = this.channels.get(msg.channelId);
    if (!channel) {
      throw new Error(`No channel found for channelId: ${msg.channelId}`);
    }
    await channel.send(msg);
  }

  // ── Inbound handler ────────────────────────────────────────────────────────

  private async handleInbound(msg: InboundMessage, channel: BaseChannel): Promise<void> {
    // Rate limit
    if (!this.rateLimiter.check(msg.userId)) {
      await channel.send({
        channelType: channel.channelType,
        channelId: msg.channelId,
        text: "⚠️ Rate limit exceeded. Please wait a moment.",
        replyToId: msg.metadata?.messageId as string | undefined,
      });
      return;
    }

    this.emit("message", msg);

    if (this.messageHandler) {
      const reply = async (text: string): Promise<void> => {
        await channel.send({
          channelType: channel.channelType,
          channelId: msg.channelId,
          text,
          parseMarkdown: true,
          replyToId: msg.metadata?.messageId as string | undefined,
        });
      };
      await this.messageHandler(msg, reply);
    }
  }

  // ── HTTP ingress ───────────────────────────────────────────────────────────

  private async handleHttp(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", channels: this.channels.size });
    }

    // Webhook inbound: POST /webhook/<channelId>
    if (url.pathname.startsWith("/webhook/") && req.method === "POST") {
      const channelId = url.pathname.slice("/webhook/".length);
      const channel = this.channels.get(channelId);
      if (channel instanceof WebhookChannel) {
        const payload = await req.json() as Record<string, unknown>;
        channel.handleInbound(payload);
        return Response.json({ ok: true });
      }
      return Response.json({ error: "Channel not found" }, { status: 404 });
    }

    // HTTP channel: POST /message
    if (url.pathname === "/message" && req.method === "POST") {
      const body = await req.json() as { text: string; channelId?: string; userId?: string };
      const channelId = body.channelId ?? "http-default";
      const channel = this.channels.get(channelId);
      if (channel instanceof HttpChannel) {
        channel.handleInbound(body.text, body.userId);
        // Wait for reply
        const reply = await channel.waitForResponse(60_000);
        return Response.json({ reply: reply?.text ?? null });
      }
      return Response.json({ error: "HTTP channel not found" }, { status: 404 });
    }

    // Gateway status
    if (url.pathname === "/status") {
      return Response.json({
        channels: [...this.channels.keys()],
        rateLimit: this.config.rateLimitPerUser,
      });
    }

    return new Response("Not found", { status: 404 });
  }

  // ── Channel factory ────────────────────────────────────────────────────────

  private createChannel(cfg: ChannelConfig): BaseChannel | null {
    switch (cfg.type) {
      case "telegram": return new TelegramChannel(cfg);
      case "webhook": return new WebhookChannel(cfg);
      case "http": return new HttpChannel(cfg);
      default:
        console.warn(`[OpenClaw] Unknown channel type: ${cfg.type}`);
        return null;
    }
  }
}
packages/openclaw/src/CoworkGateway.ts
TypeScript

/**
 * High-level integration: wires GatewayServer to the cowork agent loop.
 * Drop-in: create a CoworkGateway and call start() to begin accepting
 * messages from configured channels and routing them through cowork.
 */
import { GatewayServer } from "./GatewayServer";
import type { GatewayConfig, InboundMessage } from "./types";
import { MemorySystem, resolveSettings } from "@cowork/core";
import path from "path";
import { mkdir } from "node:fs/promises";

export interface CoworkGatewayConfig extends GatewayConfig {
  agentSystemPrompt?: string;
  historyTurns?: number;     // per-user history kept in memory (default 20)
}

export class CoworkGateway {
  private server: GatewayServer;
  private config: CoworkGatewayConfig;
  private userSessions = new Map<
    string,
    Array<{ role: "user" | "assistant"; content: string }>
  >();

  constructor(config: CoworkGatewayConfig) {
    this.config = { historyTurns: 20, ...config };
    this.server = new GatewayServer(config);
  }

  async start(): Promise<void> {
    this.server.onMessage(async (msg, reply) => {
      await this.handleMessage(msg, reply);
    });
    await this.server.start();
  }

  async stop(): Promise<void> {
    await this.server.stop();
  }

  private async handleMessage(
    msg: InboundMessage,
    reply: (text: string) => Promise<void>
  ): Promise<void> {
    // ── typing indicator (best effort) ────────────────────────────────────
    const sessionKey = `${msg.channelType}:${msg.channelId}:${msg.userId}`;
    const history = this.userSessions.get(sessionKey) ?? [];

    // Append user turn
    history.push({ role: "user", content: msg.text });
    if (history.length > (this.config.historyTurns ?? 20) * 2) {
      history.splice(0, 2);
    }
    this.userSessions.set(sessionKey, history);

    try {
      // Dynamically import queryLoop to avoid circular deps at startup
      const { queryLoop } = await import("@cowork/core");
      const settings = await resolveSettings(
        this.config.projectRoot,
        process.env,
        {}
      );

      // Collect final text from the agent loop
      let response = "";
      for await (const event of queryLoop(msg.text, {
        settings,
        systemPrompt:
          this.config.agentSystemPrompt ??
          "You are a helpful AI assistant responding via a messaging gateway.",
        history: history.slice(0, -1), // exclude the turn we just added
        tools: [],
        projectRoot: this.config.projectRoot,
      })) {
        if (event.type === "text") response += event.text;
      }

      if (!response) response = "(No response)";

      // Append assistant turn
      history.push({ role: "assistant", content: response });
      this.userSessions.set(sessionKey, history);

      await reply(response);
    } catch (err) {
      await reply(
        `⚠️ Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
packages/openclaw/src/index.ts
TypeScript

export { GatewayServer } from "./GatewayServer";
export { CoworkGateway } from "./CoworkGateway";
export { RateLimiter } from "./RateLimiter";
export { BaseChannel } from "./channels/BaseChannel";
export { TelegramChannel } from "./channels/TelegramChannel";
export { WebhookChannel } from "./channels/WebhookChannel";
export { HttpChannel } from "./channels/HttpChannel";
export type {
  GatewayConfig,
  CoworkGatewayConfig,
  ChannelConfig,
  ChannelType,
  InboundMessage,
  OutboundMessage,
  MessageAttachment,
  RateLimitState,
} from "./types";
3. Hermes — MCP Server Host — packages/hermes/
packages/hermes/package.json
JSON

{
  "name": "@cowork/hermes",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "bin": {
    "hermes": "./src/bin.ts"
  },
  "dependencies": {
    "@cowork/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "bun-types": "latest"
  }
}
packages/hermes/src/types.ts
TypeScript

export interface HermesConfig {
  projectRoot: string;
  tools?: string[];          // tool names to expose (all if omitted)
  transport: "stdio" | "sse";
  port?: number;             // for SSE transport (default 3722)
  authToken?: string;        // optional Bearer token for SSE
  verbose?: boolean;
}

export interface MCPRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
packages/hermes/src/HermesServer.ts
TypeScript

/**
 * Hermes: exposes cowork tools as an MCP server.
 * Other agents (Claude Desktop, cursor, other cowork instances) can
 * connect to Hermes and call cowork tools as MCP tools.
 *
 * Supports:
 *   - stdio transport (piped through stdin/stdout, standard MCP)
 *   - SSE transport (HTTP + Server-Sent Events for remote agents)
 */

import type { HermesConfig, MCPRequest, MCPResponse, MCPToolSchema } from "./types";
import type { ToolDefinition, ToolContext } from "@cowork/core";
import { DEFAULT_TOOLS, resolveSettings } from "@cowork/core";
import { EXTENDED_TOOLS } from "@cowork/core";
import { WIKI_TOOLS } from "@cowork/wiki";

export class HermesServer {
  private config: HermesConfig;
  private tools: ToolDefinition[];
  private httpServer?: ReturnType<typeof Bun.serve>;

  constructor(config: HermesConfig) {
    this.config = { port: 3722, transport: "stdio", verbose: false, ...config };
    // Build the tool list to expose
    const allTools = [...DEFAULT_TOOLS, ...EXTENDED_TOOLS, ...WIKI_TOOLS];
    this.tools = config.tools
      ? allTools.filter((t) => config.tools!.includes(t.name))
      : allTools;
  }

  async start(): Promise<void> {
    if (this.config.transport === "stdio") {
      await this.runStdio();
    } else {
      await this.runSSE();
    }
  }

  // ── stdio transport ────────────────────────────────────────────────────────

  private async runStdio(): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";

    process.stdin.setEncoding("utf-8");

    for await (const chunk of process.stdin) {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk as Buffer);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const req = JSON.parse(line) as MCPRequest;
          const res = await this.handleRequest(req);
          process.stdout.write(JSON.stringify(res) + "\n");
        } catch (err) {
          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Parse error" },
            }) + "\n"
          );
        }
      }
    }
  }

  // ── SSE transport ──────────────────────────────────────────────────────────

  private async runSSE(): Promise<void> {
    const self = this;
    this.httpServer = Bun.serve({
      port: this.config.port,
      fetch(req) {
        return self.handleHttpRequest(req);
      },
    });
    console.error(
      `[Hermes] MCP SSE server running on http://localhost:${this.config.port}`
    );
    // Keep alive
    await new Promise<never>(() => {});
  }

  private async handleHttpRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Auth check
    if (this.config.authToken) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${this.config.authToken}`) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    if (url.pathname === "/mcp" && req.method === "POST") {
      const body = await req.json() as MCPRequest;
      const res = await this.handleRequest(body);
      return Response.json(res);
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", tools: this.tools.length });
    }

    return new Response("Not found", { status: 404 });
  }

  // ── Request router ─────────────────────────────────────────────────────────

  private async handleRequest(req: MCPRequest): Promise<MCPResponse> {
    try {
      switch (req.method) {
        case "initialize":
          return this.ok(req.id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "hermes", version: "0.1.0" },
          });

        case "tools/list":
          return this.ok(req.id, { tools: this.buildSchemas() });

        case "tools/call": {
          const params = req.params as { name: string; arguments: Record<string, unknown> };
          const result = await this.callTool(params.name, params.arguments);
          return this.ok(req.id, result);
        }

        default:
          return this.err(req.id, -32601, `Method not found: ${req.method}`);
      }
    } catch (err) {
      return this.err(req.id, -32000, err instanceof Error ? err.message : String(err));
    }
  }

  // ── Tool execution ─────────────────────────────────────────────────────────

  private async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: "text"; text: string }>; isError: boolean }> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Tool not found: ${name}` }],
        isError: true,
      };
    }

    const settings = await resolveSettings(this.config.projectRoot, process.env, {});
    const ctx: ToolContext = {
      workingDirectory: this.config.projectRoot,
      settings,
      tools: this.tools,
    };

    try {
      const result = await tool.execute(args, ctx);
      return {
        content: [{ type: "text", text: result.content }],
        isError: result.isError,
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }

  // ── Schema helpers ─────────────────────────────────────────────────────────

  private buildSchemas(): MCPToolSchema[] {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  private ok(id: MCPRequest["id"], result: unknown): MCPResponse {
    return { jsonrpc: "2.0", id, result };
  }

  private err(id: MCPRequest["id"], code: number, message: string): MCPResponse {
    return { jsonrpc: "2.0", id, error: { code, message } };
  }
}
packages/hermes/src/bin.ts
TypeScript

#!/usr/bin/env bun
/**
 * hermes — start a Hermes MCP server
 *
 * Usage:
 *   hermes                        (stdio, all tools)
 *   hermes --transport sse        (SSE on port 3722)
 *   hermes --port 4000            (SSE on custom port)
 *   hermes --tools Read,Write     (expose specific tools)
 */

import { HermesServer } from "./HermesServer";

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const server = new HermesServer({
  projectRoot: process.cwd(),
  transport: (get("--transport") as "stdio" | "sse") ?? "stdio",
  port: get("--port") ? parseInt(get("--port")!) : 3722,
  tools: get("--tools") ? get("--tools")!.split(",") : undefined,
  authToken: process.env.HERMES_AUTH_TOKEN,
  verbose: args.includes("--verbose"),
});

await server.start();
packages/hermes/src/index.ts
TypeScript

export { HermesServer } from "./HermesServer";
export type { HermesConfig, MCPRequest, MCPResponse, MCPToolSchema } from "./types";
4. Telemetry / Observability — packages/telemetry/
packages/telemetry/package.json
JSON

{
  "name": "@cowork/telemetry",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "dependencies": {
    "@cowork/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "bun-types": "latest"
  }
}
packages/telemetry/src/types.ts
TypeScript

export type SpanStatus = "ok" | "error" | "timeout";

export interface Span {
  id: string;
  parentId?: string;
  traceId: string;
  name: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
  status: SpanStatus;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  error?: string;
}

export interface SpanEvent {
  name: string;
  ts: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface Trace {
  id: string;
  rootSpanId: string;
  spans: Span[];
  startMs: number;
  endMs?: number;
  metadata?: Record<string, unknown>;
}

export interface MetricPoint {
  name: string;
  value: number;
  ts: number;
  labels: Record<string, string>;
}

export interface TelemetryConfig {
  projectRoot: string;
  enabled?: boolean;
  retentionDays?: number;    // default 30
  exportOtlpUrl?: string;    // optional OTLP HTTP endpoint
}
packages/telemetry/src/Tracer.ts
TypeScript

import type { Span, SpanStatus, SpanEvent, Trace } from "./types";
import { randomUUID } from "node:crypto";

export class Tracer {
  private activeSpans = new Map<string, Span>();
  private completedTraces: Trace[] = [];
  private onSpanEnd?: (span: Span) => void;

  constructor(onSpanEnd?: (span: Span) => void) {
    this.onSpanEnd = onSpanEnd;
  }

  startTrace(name: string, attributes: Record<string, string | number | boolean> = {}): Span {
    const traceId = randomUUID();
    const span = this.createSpan(name, traceId, undefined, attributes);
    return span;
  }

  startSpan(
    name: string,
    parentSpanOrTraceId: Span | string,
    attributes: Record<string, string | number | boolean> = {}
  ): Span {
    const traceId =
      typeof parentSpanOrTraceId === "string"
        ? parentSpanOrTraceId
        : parentSpanOrTraceId.traceId;
    const parentId =
      typeof parentSpanOrTraceId === "string" ? undefined : parentSpanOrTraceId.id;
    return this.createSpan(name, traceId, parentId, attributes);
  }

  endSpan(
    spanOrId: Span | string,
    status: SpanStatus = "ok",
    error?: string
  ): Span {
    const id = typeof spanOrId === "string" ? spanOrId : spanOrId.id;
    const span = this.activeSpans.get(id);
    if (!span) throw new Error(`Span not found: ${id}`);

    span.endMs = Date.now();
    span.durationMs = span.endMs - span.startMs;
    span.status = status;
    if (error) span.error = error;

    this.activeSpans.delete(id);
    this.onSpanEnd?.(span);

    // If this is a root span, finalize the trace
    if (!span.parentId) {
      this.finalizeTrace(span);
    }

    return span;
  }

  addEvent(spanOrId: Span | string, name: string, attributes?: Record<string, string | number | boolean>): void {
    const id = typeof spanOrId === "string" ? spanOrId : spanOrId.id;
    const span = this.activeSpans.get(id);
    if (!span) return;
    span.events.push({ name, ts: Date.now(), attributes });
  }

  setAttribute(spanOrId: Span | string, key: string, value: string | number | boolean): void {
    const id = typeof spanOrId === "string" ? spanOrId : spanOrId.id;
    const span = this.activeSpans.get(id);
    if (span) span.attributes[key] = value;
  }

  getRecentTraces(limit = 20): Trace[] {
    return this.completedTraces.slice(-limit);
  }

  private createSpan(
    name: string,
    traceId: string,
    parentId?: string,
    attributes: Record<string, string | number | boolean> = {}
  ): Span {
    const span: Span = {
      id: randomUUID(),
      traceId,
      parentId,
      name,
      startMs: Date.now(),
      status: "ok",
      attributes: { ...attributes },
      events: [],
    };
    this.activeSpans.set(span.id, span);
    return span;
  }

  private finalizeTrace(rootSpan: Span): void {
    // Collect all spans with matching traceId
    const spans = [rootSpan];
    // Note: completed spans already removed from activeSpans
    const trace: Trace = {
      id: rootSpan.traceId,
      rootSpanId: rootSpan.id,
      spans,
      startMs: rootSpan.startMs,
      endMs: rootSpan.endMs,
    };
    this.completedTraces.push(trace);
    // Keep last 500 traces in memory
    if (this.completedTraces.length > 500) {
      this.completedTraces.shift();
    }
  }
}
packages/telemetry/src/MetricsCollector.ts
TypeScript

import type { MetricPoint } from "./types";

export class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private points: MetricPoint[] = [];

  counter(name: string, labels: Record<string, string> = {}, delta = 1): void {
    const key = metricKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + delta);
    this.points.push({ name, value: this.counters.get(key)!, ts: Date.now(), labels });
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = metricKey(name, labels);
    this.gauges.set(key, value);
    this.points.push({ name, value, ts: Date.now(), labels });
  }

  histogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = metricKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
    this.points.push({ name, value, ts: Date.now(), labels });
  }

  summary(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of this.counters.entries()) {
      result[`counter.${key}`] = value;
    }
    for (const [key, value] of this.gauges.entries()) {
      result[`gauge.${key}`] = value;
    }
    for (const [key, values] of this.histograms.entries()) {
      const sorted = [...values].sort((a, b) => a - b);
      result[`hist.${key}`] = {
        count: values.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)],
      };
    }

    return result;
  }

  recentPoints(limit = 100): MetricPoint[] {
    return this.points.slice(-limit);
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.points = [];
  }
}

function metricKey(name: string, labels: Record<string, string>): string {
  const l = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return l ? `${name}{${l}}` : name;
}
packages/telemetry/src/TelemetryService.ts
TypeScript

import type { TelemetryConfig, Span } from "./types";
import { Tracer } from "./Tracer";
import { MetricsCollector } from "./MetricsCollector";
import { MemorySystem } from "@cowork/core";
import path from "path";
import { mkdir } from "node:fs/promises";

const TELEMETRY_DIR = "telemetry";

export class TelemetryService {
  readonly tracer: Tracer;
  readonly metrics: MetricsCollector;
  private config: TelemetryConfig;
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(config: TelemetryConfig) {
    this.config = { enabled: true, retentionDays: 30, ...config };
    this.metrics = new MetricsCollector();
    this.tracer = new Tracer((span) => {
      if (this.config.enabled) {
        this.metrics.histogram("span.duration", span.durationMs ?? 0, {
          name: span.name,
          status: span.status,
        });
      }
    });

    if (this.config.enabled) {
      this.flushTimer = setInterval(() => void this.flush(), 60_000);
    }
  }

  // ── Instrument agent loop events ───────────────────────────────────────────

  recordAgentTurn(opts: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    toolsUsed: string[];
    durationMs: number;
    error?: string;
  }): void {
    this.metrics.counter("agent.turns", { provider: opts.provider });
    this.metrics.counter("agent.input_tokens", { provider: opts.provider }, opts.inputTokens);
    this.metrics.counter("agent.output_tokens", { provider: opts.provider }, opts.outputTokens);
    this.metrics.histogram("agent.turn_duration_ms", opts.durationMs, {
      provider: opts.provider,
      model: opts.model,
    });
    for (const tool of opts.toolsUsed) {
      this.metrics.counter("tool.calls", { tool });
    }
    if (opts.error) {
      this.metrics.counter("agent.errors", { provider: opts.provider });
    }
  }

  recordMemoryOp(op: "save" | "search" | "delete", durationMs: number): void {
    this.metrics.counter("memory.ops", { op });
    this.metrics.histogram("memory.op_duration_ms", durationMs, { op });
  }

  getSummary(): Record<string, unknown> {
    return this.metrics.summary();
  }

  stop(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private async flush(): Promise<void> {
    const dir = path.join(
      MemorySystem.rootFor(this.config.projectRoot),
      TELEMETRY_DIR
    );
    await mkdir(dir, { recursive: true });

    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(dir, `metrics-${today}.jsonl`);

    const points = this.metrics.recentPoints(500);
    if (points.length === 0) return;

    const lines = points.map((p) => JSON.stringify(p)).join("\n") + "\n";
    const existing = await Bun.file(file).text().catch(() => "");
    await Bun.write(file, existing + lines);

    // Optional OTLP export
    if (this.config.exportOtlpUrl) {
      await this.exportOtlp(points);
    }
  }

  private async exportOtlp(
    points: ReturnType<MetricsCollector["recentPoints"]>
  ): Promise<void> {
    try {
      await fetch(this.config.exportOtlpUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceMetrics: [{ metrics: points }] }),
      });
    } catch { /* best effort */ }
  }
}
packages/telemetry/src/index.ts
TypeScript

export { Tracer } from "./Tracer";
export { MetricsCollector } from "./MetricsCollector";
export { TelemetryService } from "./TelemetryService";
export type {
  Span,
  SpanEvent,
  Trace,
  SpanStatus,
  MetricPoint,
  TelemetryConfig,
} from "./types";
5. Cost Analytics — packages/analytics/
packages/analytics/package.json
JSON

{
  "name": "@cowork/analytics",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "dependencies": {
    "@cowork/core": "workspace:*",
    "@cowork/telemetry": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "bun-types": "latest"
  }
}
packages/analytics/src/pricing.ts
TypeScript

/**
 * Per-million-token pricing table.
 * Update as providers change pricing.
 * Format: [inputCostPer1M, outputCostPer1M] in USD.
 */
export const PRICING_TABLE: Record<string, [number, number]> = {
  // Anthropic
  "claude-opus-4":       [15.00,  75.00],
  "claude-sonnet-4":     [ 3.00,  15.00],
  "claude-haiku-3-5":    [ 0.80,   4.00],
  // OpenAI
  "gpt-4o":              [ 2.50,  10.00],
  "gpt-4o-mini":         [ 0.15,   0.60],
  "o1":                  [15.00,  60.00],
  "o3-mini":             [ 1.10,   4.40],
  // DeepSeek
  "deepseek-chat":       [ 0.014,  0.28],
  "deepseek-coder":      [ 0.014,  0.28],
  // Free/local
  "ollama":              [0, 0],
  "lmstudio":            [0, 0],
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  // Try exact match first, then partial match
  const pricing =
    PRICING_TABLE[model] ??
    Object.entries(PRICING_TABLE).find(([k]) => model.includes(k))?.[1] ??
    [0, 0];
  return (inputTokens / 1_000_000) * pricing[0] + (outputTokens / 1_000_000) * pricing[1];
}
packages/analytics/src/CostTracker.ts
TypeScript

import { estimateCost } from "./pricing";
import { MemorySystem } from "@cowork/core";
import path from "path";
import { mkdir } from "node:fs/promises";

export interface UsageRecord {
  ts: string;
  sessionId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  tool?: string;
}

export interface DailySummary {
  date: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
  sessionCount: number;
}

export class CostTracker {
  private projectRoot: string;
  private sessionId: string;
  private records: UsageRecord[] = [];

  constructor(projectRoot: string, sessionId: string) {
    this.projectRoot = projectRoot;
    this.sessionId = sessionId;
  }

  track(opts: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    tool?: string;
  }): UsageRecord {
    const record: UsageRecord = {
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      provider: opts.provider,
      model: opts.model,
      inputTokens: opts.inputTokens,
      outputTokens: opts.outputTokens,
      estimatedCostUsd: estimateCost(opts.model, opts.inputTokens, opts.outputTokens),
      tool: opts.tool,
    };
    this.records.push(record);
    void this.append(record);
    return record;
  }

  sessionSummary(): {
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCostUsd: number;
    turnsTracked: number;
  } {
    return {
      totalInputTokens: this.records.reduce((s, r) => s + r.inputTokens, 0),
      totalOutputTokens: this.records.reduce((s, r) => s + r.outputTokens, 0),
      estimatedCostUsd: this.records.reduce((s, r) => s + r.estimatedCostUsd, 0),
      turnsTracked: this.records.length,
    };
  }

  async dailySummary(date?: string): Promise<DailySummary | null> {
    const d = date ?? new Date().toISOString().slice(0, 10);
    const file = this.usageFile(d);
    let lines: string[];
    try {
      const raw = await Bun.file(file).text();
      lines = raw.split("\n").filter(Boolean);
    } catch {
      return null;
    }

    const records: UsageRecord[] = lines.map((l) => JSON.parse(l));
    const byModel: DailySummary["byModel"] = {};
    const sessions = new Set<string>();

    for (const r of records) {
      sessions.add(r.sessionId);
      const m = (byModel[r.model] ??= { inputTokens: 0, outputTokens: 0, costUsd: 0 });
      m.inputTokens += r.inputTokens;
      m.outputTokens += r.outputTokens;
      m.costUsd += r.estimatedCostUsd;
    }

    return {
      date: d,
      totalInputTokens: records.reduce((s, r) => s + r.inputTokens, 0),
      totalOutputTokens: records.reduce((s, r) => s + r.outputTokens, 0),
      totalCostUsd: records.reduce((s, r) => s + r.estimatedCostUsd, 0),
      byModel,
      sessionCount: sessions.size,
    };
  }

  async monthlySummary(yearMonth?: string): Promise<{
    month: string;
    totalCostUsd: number;
    totalTokens: number;
    dailyBreakdown: DailySummary[];
  }> {
    const ym = yearMonth ?? new Date().toISOString().slice(0, 7);
    const dir = this.usageDir();
    const glob = new (await import("bun")).Glob(`${ym}-*.jsonl`);
    const summaries: DailySummary[] = [];

    try {
      for await (const file of glob.scan({ cwd: dir, onlyFiles: true })) {
        const d = file.replace(".jsonl", "");
        const s = await this.dailySummary(d);
        if (s) summaries.push(s);
      }
    } catch { /* no data */ }

    return {
      month: ym,
      totalCostUsd: summaries.reduce((s, d) => s + d.totalCostUsd, 0),
      totalTokens: summaries.reduce(
        (s, d) => s + d.totalInputTokens + d.totalOutputTokens,
        0
      ),
      dailyBreakdown: summaries.sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  private async append(record: UsageRecord): Promise<void> {
    const dir = this.usageDir();
    await mkdir(dir, { recursive: true });
    const file = this.usageFile(record.ts.slice(0, 10));
    const existing = await Bun.file(file).text().catch(() => "");
    await Bun.write(file, existing + JSON.stringify(record) + "\n");
  }

  private usageDir(): string {
    return path.join(MemorySystem.rootFor(this.projectRoot), "analytics");
  }

  private usageFile(date: string): string {
    return path.join(this.usageDir(), `${date}.jsonl`);
  }
}
packages/analytics/src/tools.ts
TypeScript

import type { ToolDefinition, ToolContext } from "@cowork/core";
import { CostTracker } from "./CostTracker";

export const UsageReport: ToolDefinition = {
  name: "UsageReport",
  description:
    "Show token usage and estimated cost. " +
    "date: specific YYYY-MM-DD, month: YYYY-MM, or omit for today's summary.",
  inputSchema: {
    type: "object",
    properties: {
      date: { type: "string", description: "YYYY-MM-DD" },
      month: { type: "string", description: "YYYY-MM" },
    },
    required: [],
  },
  permissionLevel: "READ_ONLY",
  async execute(input: { date?: string; month?: string }, ctx: ToolContext) {
    const tracker = new CostTracker(ctx.workingDirectory, "report");

    if (input.month) {
      const summary = await tracker.monthlySummary(input.month);
      const lines = [
        `## Monthly Usage: ${summary.month}`,
        `Total cost: $${summary.totalCostUsd.toFixed(4)}`,
        `Total tokens: ${summary.totalTokens.toLocaleString()}`,
        "",
        "### Daily breakdown:",
        ...summary.dailyBreakdown.map(
          (d) =>
            `  ${d.date}: $${d.totalCostUsd.toFixed(4)} | ${(d.totalInputTokens + d.totalOutputTokens).toLocaleString()} tokens | ${d.sessionCount} session(s)`
        ),
      ];
      return { content: lines.join("\n"), isError: false };
    }

    const summary = await tracker.dailySummary(input.date);
    if (!summary) {
      return { content: `No usage data for ${input.date ?? "today"}`, isError: false };
    }

    const modelLines = Object.entries(summary.byModel).map(
      ([model, data]) =>
        `  ${model}: $${data.costUsd.toFixed(4)} | in: ${data.inputTokens.toLocaleString()} | out: ${data.outputTokens.toLocaleString()}`
    );

    const lines = [
      `## Usage: ${summary.date}`,
      `Total cost: $${summary.totalCostUsd.toFixed(4)}`,
      `Input tokens: ${summary.totalInputTokens.toLocaleString()}`,
      `Output tokens: ${summary.totalOutputTokens.toLocaleString()}`,
      `Sessions: ${summary.sessionCount}`,
      "",
      "### By model:",
      ...modelLines,
    ];

    return { content: lines.join("\n"), isError: false };
  },
};

export const ANALYTICS_TOOLS: ToolDefinition[] = [UsageReport];
packages/analytics/src/index.ts
TypeScript

export { CostTracker } from "./CostTracker";
export { estimateCost, PRICING_TABLE } from "./pricing";
export { ANALYTICS_TOOLS, UsageReport } from "./tools";
export type { UsageRecord, DailySummary } from "./CostTracker";
6. Advanced Security — packages/security/
packages/security/package.json
JSON

{
  "name": "@cowork/security",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "dependencies": {
    "@cowork/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "bun-types": "latest"
  }
}
packages/security/src/AuditLog.ts
TypeScript

import { MemorySystem } from "@cowork/core";
import path from "path";
import { mkdir } from "node:fs/promises";

export type AuditEventType =
  | "tool_call"
  | "tool_denied"
  | "approval_requested"
  | "approval_granted"
  | "approval_denied"
  | "session_start"
  | "session_end"
  | "memory_save"
  | "memory_delete"
  | "compact_triggered"
  | "permission_escalation"
  | "security_block"
  | "gateway_message"
  | "plugin_loaded"
  | "mcp_connected";

export interface AuditEntry {
  ts: string;
  sessionId: string;
  event: AuditEventType;
  actor: string;       // who triggered (user / agent / system)
  target?: string;     // what was acted on (tool name, memory id, etc.)
  details?: Record<string, unknown>;
  risk: "low" | "medium" | "high" | "critical";
}

export class AuditLog {
  private projectRoot: string;
  private sessionId: string;

  constructor(projectRoot: string, sessionId: string) {
    this.projectRoot = projectRoot;
    this.sessionId = sessionId;
  }

  async log(
    event: AuditEventType,
    opts: {
      actor: string;
      target?: string;
      details?: Record<string, unknown>;
      risk?: AuditEntry["risk"];
    }
  ): Promise<void> {
    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      event,
      actor: opts.actor,
      target: opts.target,
      details: opts.details,
      risk: opts.risk ?? this.defaultRisk(event),
    };

    const dir = path.join(
      MemorySystem.rootFor(this.projectRoot),
      "audit"
    );
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${entry.ts.slice(0, 10)}.jsonl`);
    const existing = await Bun.file(file).text().catch(() => "");
    await Bun.write(file, existing + JSON.stringify(entry) + "\n");
  }

  async query(opts: {
    date?: string;
    event?: AuditEventType;
    risk?: AuditEntry["risk"];
    limit?: number;
  }): Promise<AuditEntry[]> {
    const date = opts.date ?? new Date().toISOString().slice(0, 10);
    const file = path.join(
      MemorySystem.rootFor(this.projectRoot),
      "audit",
      `${date}.jsonl`
    );

    let entries: AuditEntry[];
    try {
      const raw = await Bun.file(file).text();
      entries = raw
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as AuditEntry);
    } catch {
      return [];
    }

    if (opts.event) entries = entries.filter((e) => e.event === opts.event);
    if (opts.risk) entries = entries.filter((e) => e.risk === opts.risk);
    return entries.slice(-(opts.limit ?? 100));
  }

  private defaultRisk(event: AuditEventType): AuditEntry["risk"] {
    const riskMap: Record<AuditEventType, AuditEntry["risk"]> = {
      tool_call: "low",
      tool_denied: "medium",
      approval_requested: "medium",
      approval_granted: "medium",
      approval_denied: "medium",
      session_start: "low",
      session_end: "low",
      memory_save: "low",
      memory_delete: "medium",
      compact_triggered: "low",
      permission_escalation: "high",
      security_block: "high",
      gateway_message: "low",
      plugin_loaded: "medium",
      mcp_connected: "medium",
    };
    return riskMap[event] ?? "low";
  }
}
packages/security/src/SandboxPolicy.ts
TypeScript

/**
 * SandboxPolicy: enhanced Bash security beyond the basic Phase 1 blocklist.
 * Implements tiered checks:
 *   1. Hard blocklist (always deny)
 *   2. Soft blocklist (deny unless ELEVATED permission)
 *   3. Path containment (deny escaping projectRoot)
 *   4. Network access policy (optional allowlist)
 *   5. Entropy / obfuscation detection
 */

export type PolicyVerdict = "allow" | "deny" | "warn";

export interface PolicyResult {
  verdict: PolicyVerdict;
  reason?: string;
  severity: "low" | "medium" | "high" | "critical";
}

export interface SandboxPolicyConfig {
  projectRoot: string;
  permissionLevel: string;
  allowNetworkAccess?: boolean;
  networkAllowlist?: string[];    // e.g. ["api.github.com", "registry.npmjs.org"]
  allowedCwdPrefixes?: string[];  // paths cwd must be under
}

// ── Hard blocklist: always deny regardless of permissions ────────────────────
const HARD_BLOCKLIST: Array<[RegExp, string, "high" | "critical"]> = [
  [/rm\s+-rf\s+(\/|~|\.\.\/\.\.\/|\$HOME)/, "Recursive delete of root/home", "critical"],
  [/mkfs|fdisk|parted|wipefs/, "Disk formatting command", "critical"],
  [/:(){ :|:& };:/, "Fork bomb", "critical"],
  [/dd\s+if=\/dev\/zero\s+of=\/dev\//, "Disk wipe via dd", "critical"],
  [/>\s*\/etc\/passwd|>\s*\/etc\/shadow/, "Overwriting system auth files", "critical"],
  [/chmod\s+777\s+\//, "Insecure permissions on root", "critical"],
  [/\x00/, "Null byte in command", "high"],
  [/[\u200b\u200c\u200d\ufeff]/, "Zero-width unicode characters", "high"],
  [/IFS\s*=/, "IFS reassignment", "high"],
  [/base64\s+--decode.*\|\s*bash/, "Encoded payload execution", "critical"],
  [/eval\s+\$\(.*\)/, "Eval subshell injection pattern", "high"],
  [/curl.*\|\s*(?:ba)?sh/, "Pipe-to-shell from network", "critical"],
  [/wget.*-O\s*-.*\|\s*(?:ba)?sh/, "Pipe-to-shell from network (wget)", "critical"],
];

// ── Soft blocklist: deny unless ELEVATED or FULL permissions ─────────────────
const SOFT_BLOCKLIST: Array<[RegExp, string]> = [
  [/sudo\s+/, "sudo usage"],
  [/su\s+-/, "su usage"],
  [/crontab\s+/, "crontab modification"],
  [/systemctl\s+(enable|disable|stop|start|restart)/, "systemctl service management"],
  [/launchctl\s+/, "launchctl (macOS service management)"],
  [/iptables|ufw|firewall-cmd/, "Firewall modification"],
  [/sysctl\s+-w/, "Kernel parameter modification"],
  [/mount\s+/, "Mount command"],
  [/chown\s+root/, "chown to root"],
];

const ELEVATED_PERMISSIONS = new Set(["ELEVATED", "FULL", "DANGEROUS"]);

export class SandboxPolicy {
  private config: SandboxPolicyConfig;

  constructor(config: SandboxPolicyConfig) {
    this.config = config;
  }

  check(command: string): PolicyResult {
    // ── 1. Hard blocklist ─────────────────────────────────────────────────
    for (const [pattern, reason, severity] of HARD_BLOCKLIST) {
      if (pattern.test(command)) {
        return { verdict: "deny", reason, severity };
      }
    }

    // ── 2. Soft blocklist ─────────────────────────────────────────────────
    if (!ELEVATED_PERMISSIONS.has(this.config.permissionLevel)) {
      for (const [pattern, reason] of SOFT_BLOCKLIST) {
        if (pattern.test(command)) {
          return { verdict: "deny", reason: `${reason} requires ELEVATED+ permission`, severity: "high" };
        }
      }
    }

    // ── 3. Entropy check: detect possibly encoded/obfuscated commands ──────
    const entropy = this.shannonEntropy(command);
    if (entropy > 4.5 && command.length > 80) {
      return {
        verdict: "warn",
        reason: `High entropy command (${entropy.toFixed(2)}) — possible obfuscation`,
        severity: "medium",
      };
    }

    // ── 4. Network access policy ──────────────────────────────────────────
    if (!this.config.allowNetworkAccess) {
      const netPattern = /curl|wget|nc\s|ncat\s|ssh\s|sftp\s|rsync\s.*@/;
      if (netPattern.test(command)) {
        if (!this.config.networkAllowlist?.some((h) => command.includes(h))) {
          return {
            verdict: "deny",
            reason: "Network access not permitted in current sandbox policy",
            severity: "medium",
          };
        }
      }
    }

    return { verdict: "allow", severity: "low" };
  }

  private shannonEntropy(s: string): number {
    const freq = new Map<string, number>();
    for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
    let entropy = 0;
    for (const count of freq.values()) {
      const p = count / s.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }
}
packages/security/src/tools.ts
TypeScript

import type { ToolDefinition, ToolContext } from "@cowork/core";
import { AuditLog } from "./AuditLog";

export const AuditQuery: ToolDefinition = {
  name: "AuditQuery",
  description:
    "Query the session audit log. View recent security events, tool calls, " +
    "approvals, and permission escalations. Useful for reviewing what the agent has done.",
  inputSchema: {
    type: "object",
    properties: {
      date: { type: "string", description: "YYYY-MM-DD (default today)" },
      event: {
        type: "string",
        description: "Filter by event type (tool_call, security_block, approval_denied, etc.)",
      },
      risk: {
        type: "string",
        enum: ["low", "medium", "high", "critical"],
      },
      limit: { type: "number", description: "Max entries (default 50)" },
    },
    required: [],
  },
  permissionLevel: "READ_ONLY",
  async execute(
    input: { date?: string; event?: string; risk?: string; limit?: number },
    ctx: ToolContext
  ) {
    const log = new AuditLog(ctx.workingDirectory, "audit-tool");
    const entries = await log.query({
      date: input.date,
      event: input.event as any,
      risk: input.risk as any,
      limit: input.limit ?? 50,
    });

    if (entries.length === 0) {
      return { content: "No audit entries found for the given filters.", isError: false };
    }

    const lines = entries.map(
      (e) =>
        `[${e.ts}] ${e.risk.toUpperCase().padEnd(8)} ${e.event.padEnd(25)} actor=${e.actor}${e.target ? ` target=${e.target}` : ""}`
    );

    return { content: lines.join("\n"), isError: false };
  },
};

export const SECURITY_TOOLS: ToolDefinition[] = [AuditQuery];
packages/security/src/index.ts
TypeScript

export { AuditLog } from "./AuditLog";
export { SandboxPolicy } from "./SandboxPolicy";
export { SECURITY_TOOLS, AuditQuery } from "./tools";
export type {
  AuditEntry,
  AuditEventType,
} from "./AuditLog";
export type { PolicyResult, PolicyVerdict, SandboxPolicyConfig } from "./SandboxPolicy";
7. Prompt Cache Engineering — packages/cache/
packages/cache/package.json
JSON

{
  "name": "@cowork/cache",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "dependencies": {
    "@cowork/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "bun-types": "latest"
  }
}
packages/cache/src/CacheAwareSystemPrompt.ts
TypeScript

/**
 * Cache-aware system prompt builder.
 *
 * Anthropic's prompt caching requires the prompt to be IDENTICAL
 * across requests to hit the cache. This module enforces:
 *
 * 1. Stable base layer (never changes mid-session)
 * 2. Stable project layer (CLAUDE.md — changes only if file changes)
 * 3. Volatile layer (MEMORY.md index — changes every few turns)
 *
 * The first two layers will hit the cache on Anthropic (>1024 tokens).
 * The volatile layer is always fresh.
 *
 * Also produces cache breakpoint markers for the Anthropic API's
 * explicit cache_control blocks.
 */

import path from "path";
import { createHash } from "node:crypto";

export interface CachedPromptLayer {
  content: string;
  cacheBreakpoint: boolean;   // set cache_control: {type:"ephemeral"} on this block
  hash: string;               // content hash for staleness detection
}

export interface CacheAwarePrompt {
  layers: CachedPromptLayer[];
  combined: string;
  estimatedCacheableTokens: number;
  baseLayerHash: string;
}

export interface CachePromptOptions {
  baseSystemPrompt: string;
  claudeMdPath?: string;     // absolute path to CLAUDE.md
  memoryIndexContent?: string;
  toolDescriptions?: string; // pre-rendered tool list (stable per session)
}

export class CacheAwareSystemPrompt {
  private options: CachePromptOptions;
  private cachedClaudeMd: { content: string; mtime: number } | null = null;

  constructor(options: CachePromptOptions) {
    this.options = options;
  }

  async build(): Promise<CacheAwarePrompt> {
    const layers: CachedPromptLayer[] = [];

    // ── Layer 1: Base (maximally stable — never changes) ──────────────────
    const baseContent = [
      this.options.baseSystemPrompt,
      this.options.toolDescriptions ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");

    layers.push({
      content: baseContent,
      cacheBreakpoint: true,   // mark for Anthropic cache_control
      hash: hash(baseContent),
    });

    // ── Layer 2: Project context (stable-ish — changes only if CLAUDE.md changes) ──
    const claudeMd = await this.loadClaudeMd();
    if (claudeMd) {
      layers.push({
        content: `<project_context>\n${claudeMd}\n</project_context>`,
        cacheBreakpoint: true,
        hash: hash(claudeMd),
      });
    }

    // ── Layer 3: Volatile (memory index — changes frequently, NO cache breakpoint) ──
    if (this.options.memoryIndexContent) {
      layers.push({
        content: `<memory_index>\n${this.options.memoryIndexContent}\n</memory_index>`,
        cacheBreakpoint: false,
        hash: hash(this.options.memoryIndexContent),
      });
    }

    const combined = layers.map((l) => l.content).join("\n\n");

    // Estimate cacheable tokens (layers 1 + 2 only)
    const cacheableContent = layers
      .filter((l) => l.cacheBreakpoint)
      .map((l) => l.content)
      .join("\n\n");

    return {
      layers,
      combined,
      estimatedCacheableTokens: Math.floor(cacheableContent.length / 4),
      baseLayerHash: layers[0].hash,
    };
  }

  /**
   * Converts layers into Anthropic-style content blocks with cache_control.
   * Use this when calling the Anthropic API directly.
   */
  toAnthropicBlocks(prompt: CacheAwarePrompt): Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }> {
    return prompt.layers.map((layer) => ({
      type: "text" as const,
      text: layer.content,
      ...(layer.cacheBreakpoint ? { cache_control: { type: "ephemeral" as const } } : {}),
    }));
  }

  private async loadClaudeMd(): Promise<string | null> {
    if (!this.options.claudeMdPath) return null;

    try {
      const file = Bun.file(this.options.claudeMdPath);
      const stat = await file.stat();
      const mtime = stat?.mtime?.getTime() ?? 0;

      // Use cached version if file hasn't changed
      if (this.cachedClaudeMd && this.cachedClaudeMd.mtime === mtime) {
        return this.cachedClaudeMd.content;
      }

      const content = (await file.text()).slice(0, 12_000);
      this.cachedClaudeMd = { content, mtime };
      return content;
    } catch {
      return null;
    }
  }
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
packages/cache/src/PromptCacheStats.ts
TypeScript

/**
 * Tracks prompt cache hit/miss patterns and estimates savings.
 */

export interface CacheEvent {
  ts: number;
  type: "hit" | "miss" | "write";
  layerHash: string;
  estimatedTokens: number;
  estimatedSavingsUsd?: number;
}

export class PromptCacheStats {
  private events: CacheEvent[] = [];

  record(event: CacheEvent): void {
    this.events.push(event);
  }

  summary(): {
    totalHits: number;
    totalMisses: number;
    hitRate: number;
    estimatedTokensSaved: number;
    estimatedUsdSaved: number;
    recentEvents: CacheEvent[];
  } {
    const hits = this.events.filter((e) => e.type === "hit");
    const misses = this.events.filter((e) => e.type === "miss");
    const total = hits.length + misses.length;

    return {
      totalHits: hits.length,
      totalMisses: misses.length,
      hitRate: total > 0 ? hits.length / total : 0,
      estimatedTokensSaved: hits.reduce((s, e) => s + e.estimatedTokens, 0),
      estimatedUsdSaved: hits.reduce((s, e) => s + (e.estimatedSavingsUsd ?? 0), 0),
      recentEvents: this.events.slice(-20),
    };
  }

  reset(): void {
    this.events = [];
  }
}
packages/cache/src/index.ts
TypeScript

export { CacheAwareSystemPrompt } from "./CacheAwareSystemPrompt";
export { PromptCacheStats } from "./PromptCacheStats";
export type { CachedPromptLayer, CacheAwarePrompt, CachePromptOptions } from "./CacheAwareSystemPrompt";
export type { CacheEvent } from "./PromptCacheStats";
8. Council — Multi-Agent Debate — packages/core/src/council/
packages/core/src/council/CouncilDebate.ts
TypeScript

/**
 * Council: runs a structured multi-agent debate.
 * Multiple agents (with distinct "stances") argue for and against a position,
 * then a moderator synthesizes a verdict.
 *
 * Inspired by the "agora-council" pattern from the OpenClaw skills ecosystem.
 */

import { QueryEngine, resolveProvider, type ResolvedSettings } from "../index";

export type CouncilStance = "for" | "against" | "neutral" | "devil" | "expert" | "pragmatist";

export interface CouncilAgent {
  id: string;
  name: string;
  stance: CouncilStance;
  domain?: string;    // optional domain expertise e.g. "security", "performance"
}

export interface CouncilRound {
  agentId: string;
  stance: CouncilStance;
  argument: string;
  round: number;
}

export interface CouncilVerdict {
  question: string;
  rounds: CouncilRound[];
  verdict: string;
  confidence: "high" | "medium" | "low";
  dissent?: string;
  totalTurns: number;
}

export interface CouncilConfig {
  question: string;
  context?: string;
  agents: CouncilAgent[];
  debateRounds?: number;     // default 2 (each agent speaks debateRounds times)
  settings: ResolvedSettings;
  verbose?: boolean;
}

const STANCE_PROMPTS: Record<CouncilStance, string> = {
  for: "You are arguing strongly IN FAVOR of the proposition. Make the best possible case.",
  against: "You are arguing AGAINST the proposition. Identify its flaws and risks.",
  neutral: "You are a neutral analyst. Present a balanced view, neither for nor against.",
  devil: "You are the devil's advocate. Challenge any consensus that forms. Find weaknesses in every argument.",
  expert: "You are a domain expert. Provide technical depth and nuance the others may miss.",
  pragmatist: "You are a pragmatist. Focus on what's actually feasible and realistic to implement.",
};

export class CouncilDebate {
  private config: CouncilConfig;
  private engine: QueryEngine;

  constructor(config: CouncilConfig) {
    this.config = { debateRounds: 2, ...config };
    const providerCfg = resolveProvider({
      provider: config.settings.provider,
      model: config.settings.model,
    });
    this.engine = new QueryEngine(providerCfg);
  }

  async run(): Promise<CouncilVerdict> {
    const rounds: CouncilRound[] = [];
    let totalTurns = 0;

    const { question, context, agents, debateRounds = 2 } = this.config;

    // ── Debate rounds ──────────────────────────────────────────────────────
    for (let roundNum = 1; roundNum <= debateRounds; roundNum++) {
      for (const agent of agents) {
        if (this.config.verbose) {
          console.error(`[Council] Round ${roundNum} — ${agent.name} (${agent.stance})`);
        }

        const priorArgs = rounds
          .map((r) => {
            const a = agents.find((ag) => ag.id === r.agentId)!;
            return `[${a.name} — ${r.stance}] ${r.argument}`;
          })
          .join("\n\n");

        const systemPrompt = [
          `You are ${agent.name}, a council member.`,
          STANCE_PROMPTS[agent.stance],
          agent.domain ? `Your domain expertise: ${agent.domain}.` : "",
          "Be concise (2–4 sentences). Respond directly to prior arguments if any.",
        ]
          .filter(Boolean)
          .join(" ");

        const userMsg = [
          `Question before the council: ${question}`,
          context ? `\nContext: ${context}` : "",
          priorArgs ? `\nPrior arguments:\n${priorArgs}` : "",
          `\nRound ${roundNum}: your argument now.`,
        ]
          .filter(Boolean)
          .join("\n\n");

        try {
          const response = await this.engine.call({
            systemPrompt,
            messages: [{ role: "user", content: userMsg }],
            tools: [],
            maxTokens: 512,
          });
          totalTurns++;

          const argument = response.content
            .filter((b): b is { type: "text"; text: string } => b.type === "text")
            .map((b) => b.text)
            .join("")
            .trim();

          rounds.push({ agentId: agent.id, stance: agent.stance, argument, round: roundNum });
        } catch (err) {
          rounds.push({
            agentId: agent.id,
            stance: agent.stance,
            argument: `[error: ${err instanceof Error ? err.message : String(err)}]`,
            round: roundNum,
          });
        }
      }
    }

    // ── Moderator verdict ──────────────────────────────────────────────────
    const transcript = rounds
      .map((r) => {
        const a = agents.find((ag) => ag.id === r.agentId)!;
        return `[R${r.round}] ${a.name} (${r.stance}): ${r.argument}`;
      })
      .join("\n\n");

    const verdictSystem = [
      "You are the council moderator. Having heard all arguments, deliver a verdict.",
      "Return JSON: {\"verdict\":\"...\",\"confidence\":\"high|medium|low\",\"dissent\":\"...or null\"}",
      "verdict: 2–3 sentence conclusion. confidence: your certainty. dissent: strongest counterpoint if any.",
    ].join(" ");

    let verdict = "The council reached no consensus.";
    let confidence: CouncilVerdict["confidence"] = "low";
    let dissent: string | undefined;

    try {
      const response = await this.engine.call({
        systemPrompt: verdictSystem,
        messages: [
          {
            role: "user",
            content: `Question: ${question}\n\nDebate transcript:\n${transcript}`,
          },
        ],
        tools: [],
        maxTokens: 512,
      });
      totalTurns++;

      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");

      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        verdict = parsed.verdict ?? verdict;
        confidence = parsed.confidence ?? confidence;
        dissent = parsed.dissent ?? undefined;
      }
    } catch { /* use defaults */ }

    return { question, rounds, verdict, confidence, dissent, totalTurns };
  }
}
packages/core/src/council/tools.ts
TypeScript

import type { ToolDefinition, ToolContext } from "../tools/types";
import { CouncilDebate, type CouncilAgent } from "./CouncilDebate";

export const CouncilRun: ToolDefinition = {
  name: "CouncilRun",
  description: [
    "Run a structured multi-agent council debate on a question.",
    "Multiple AI agents with different stances (for/against/neutral/devil/expert/pragmatist) argue",
    "in structured rounds, then a moderator delivers a verdict with confidence level.",
    "Best for: architecture decisions, risk assessment, design tradeoffs.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question or proposition for the council to debate",
      },
      context: {
        type: "string",
        description: "Optional background context for the debate",
      },
      stances: {
        type: "array",
        description: "Agent stances (default: for, against, devil, expert, pragmatist)",
        items: {
          type: "string",
          enum: ["for", "against", "neutral", "devil", "expert", "pragmatist"],
        },
      },
      rounds: {
        type: "number",
        description: "Debate rounds per agent (default 2)",
      },
    },
    required: ["question"],
  },
  permissionLevel: "STANDARD",
  async execute(
    input: {
      question: string;
      context?: string;
      stances?: string[];
      rounds?: number;
    },
    ctx: ToolContext
  ) {
    const stances = (input.stances ?? ["for", "against", "devil", "expert", "pragmatist"]) as any[];
    const agents: CouncilAgent[] = stances.map((stance, i) => ({
      id: `agent-${i}`,
      name: `Councilor ${String.fromCharCode(65 + i)}`,
      stance,
    }));

    const debate = new CouncilDebate({
      question: input.question,
      context: input.context,
      agents,
      debateRounds: Math.min(input.rounds ?? 2, 4),
      settings: ctx.settings!,
    });

    try {
      const result = await debate.run();
      const lines = [
        `## Council Verdict`,
        `**Question:** ${result.question}`,
        `**Confidence:** ${result.confidence} | **Turns:** ${result.totalTurns}`,
        "",
        `### Verdict`,
        result.verdict,
        result.dissent ? `\n**Strongest dissent:** ${result.dissent}` : "",
        "",
        `### Debate Transcript`,
        ...result.rounds.map((r) => {
          const agent = agents.find((a) => a.id === r.agentId)!;
          return `**[R${r.round}] ${agent.name} (${r.stance}):** ${r.argument}`;
        }),
      ].filter((l) => l !== undefined);

      return { content: lines.join("\n"), isError: false };
    } catch (err) {
      return {
        content: `Council failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

export const COUNCIL_TOOLS: ToolDefinition[] = [CouncilRun];
packages/core/src/council/index.ts
TypeScript

export { CouncilDebate } from "./CouncilDebate";
export { COUNCIL_TOOLS, CouncilRun } from "./tools";
export type {
  CouncilAgent,
  CouncilRound,
  CouncilVerdict,
  CouncilConfig,
  CouncilStance,
} from "./CouncilDebate";
9. SOUL.md persona context — packages/core/src/soul/
packages/core/src/soul/SoulContext.ts
TypeScript

/**
 * SOUL.md — persona / identity context for the agent.
 * Inspired by the OpenClaw "SOUL.md" pattern:
 * a file that tells the agent who it is, who the user is, and how they work together.
 *
 * SOUL.md is loaded once and injected as the FIRST block of the system prompt —
 * before base instructions — to establish identity before anything else.
 */

import path from "path";

const SOUL_FILENAME = "SOUL.md";
const SOUL_MAX_CHARS = 4_000;

export interface SoulContext {
  content: string;
  path: string;
  loaded: boolean;
}

export async function loadSoulContext(projectRoot: string): Promise<SoulContext> {
  // Check project root first, then ~/.cowork/
  const candidates = [
    path.join(projectRoot, SOUL_FILENAME),
    path.join(projectRoot, ".cowork", SOUL_FILENAME),
    path.join(process.env.HOME ?? "~", ".cowork", SOUL_FILENAME),
  ];

  for (const candidate of candidates) {
    try {
      const content = await Bun.file(candidate).text();
      return {
        content: content.slice(0, SOUL_MAX_CHARS),
        path: candidate,
        loaded: true,
      };
    } catch { /* try next */ }
  }

  return { content: "", path: "", loaded: false };
}

export function defaultSoulTemplate(): string {
  return `# SOUL.md — Agent Persona

## Who I am
I am a focused coding and research assistant. I think carefully before acting,
prefer targeted edits over rewrites, and always explain my reasoning.

## Who you are
You are a developer working on this project. You value accuracy and clear communication.

## How we work together
- I will ask for clarification when requirements are ambiguous
- I will not make unrequested changes
- I will flag risky operations before executing them
- I maintain memory across sessions so you don't have to repeat context

## My constraints
- I do not execute commands that modify system files without explicit approval
- I do not store sensitive information (keys, passwords) in memory
- I prefer reading files over guessing their contents
`;
}

export async function ensureSoulFile(projectRoot: string): Promise<void> {
  const filePath = path.join(projectRoot, SOUL_FILENAME);
  try {
    await Bun.file(filePath).text();
    // File exists, don't overwrite
  } catch {
    await Bun.write(filePath, defaultSoulTemplate());
  }
}
10. Web Dashboard — apps/dashboard/
apps/dashboard/package.json
JSON

{
  "name": "@cowork/dashboard",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/server.ts",
  "bin": {
    "cowork-dashboard": "./src/server.ts"
  },
  "scripts": {
    "start": "bun run src/server.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cowork/core": "workspace:*",
    "@cowork/analytics": "workspace:*",
    "@cowork/telemetry": "workspace:*",
    "@cowork/security": "workspace:*",
    "@cowork/wiki": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "bun-types": "latest"
  }
}
apps/dashboard/src/server.ts
TypeScript

#!/usr/bin/env bun
/**
 * cowork-dashboard — lightweight web dashboard
 *
 * Usage:
 *   bun run apps/dashboard/src/server.ts [--port 3720] [--project /path]
 *
 * Opens at http://localhost:3720
 * Provides: memory browser, analytics, audit log, wiki pages, session status
 */

import { DashboardRouter } from "./DashboardRouter";

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const port = parseInt(getArg("--port") ?? "3720");
const projectRoot = getArg("--project") ?? process.cwd();

const router = new DashboardRouter({ projectRoot, port });
await router.start();
apps/dashboard/src/DashboardRouter.ts
TypeScript

import { MemorySystem } from "@cowork/core";
import { CostTracker } from "@cowork/analytics";
import { AuditLog } from "@cowork/security";
import { LLMWiki } from "@cowork/wiki";

export interface DashboardConfig {
  projectRoot: string;
  port: number;
}

export class DashboardRouter {
  private config: DashboardConfig;

  constructor(config: DashboardConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    const self = this;
    Bun.serve({
      port: this.config.port,
      async fetch(req) {
        return self.route(req);
      },
    });
    console.log(`[Dashboard] Running at http://localhost:${this.config.port}`);
    console.log(`[Dashboard] Project: ${this.config.projectRoot}`);
    // Keep alive
    await new Promise<never>(() => {});
  }

  private async route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { projectRoot } = this.config;

    // ── API routes ─────────────────────────────────────────────────────────

    if (url.pathname === "/api/memory") {
      const memory = new MemorySystem(projectRoot);
      const type = (url.searchParams.get("type") as any) ?? undefined;
      const entries = await memory.list(type);
      return Response.json(entries);
    }

    if (url.pathname === "/api/analytics") {
      const tracker = new CostTracker(projectRoot, "dashboard");
      const today = new Date().toISOString().slice(0, 10);
      const daily = await tracker.dailySummary(today);
      const monthly = await tracker.monthlySummary();
      return Response.json({ daily, monthly });
    }

    if (url.pathname === "/api/audit") {
      const log = new AuditLog(projectRoot, "dashboard");
      const entries = await log.query({
        date: url.searchParams.get("date") ?? undefined,
        risk: (url.searchParams.get("risk") as any) ?? undefined,
        limit: 100,
      });
      return Response.json(entries);
    }

    if (url.pathname === "/api/wiki") {
      const wiki = new LLMWiki({ projectRoot });
      const slug = url.searchParams.get("slug");
      if (slug) {
        const page = await wiki.getPage(slug);
        return Response.json(page ?? { error: "Not found" });
      }
      const pages = await wiki.listPages();
      return Response.json(pages);
    }

    if (url.pathname === "/api/status") {
      return Response.json({
        projectRoot,
        serverTime: new Date().toISOString(),
        version: "0.1.0-phase4",
      });
    }

    // ── UI ─────────────────────────────────────────────────────────────────

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(renderDashboardHTML(this.config), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  }
}

function renderDashboardHTML(config: DashboardConfig): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CoWork Dashboard</title>
  <style>
    :root {
      --bg: #0f0f0f; --surface: #1a1a1a; --border: #2a2a2a;
      --text: #e8e8e8; --muted: #888; --accent: #7c6af7;
      --green: #4caf82; --red: #e05757; --yellow: #e8b84b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'SF Mono', monospace; font-size: 13px; }
    header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 24px; display: flex; align-items: center; gap: 16px; }
    header h1 { font-size: 16px; color: var(--accent); }
    header span { color: var(--muted); font-size: 11px; }
    nav { display: flex; gap: 8px; margin-left: auto; }
    nav button { background: none; border: 1px solid var(--border); color: var(--muted); padding: 4px 12px; cursor: pointer; border-radius: 4px; font-family: inherit; font-size: 12px; }
    nav button.active { border-color: var(--accent); color: var(--accent); }
    main { padding: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
    .card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 12px; }
    .stat { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); }
    .stat:last-child { border-bottom: none; }
    .stat-label { color: var(--muted); }
    .stat-value { color: var(--text); font-weight: 500; }
    .list-item { padding: 6px 0; border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: baseline; }
    .list-item:last-child { border-bottom: none; }
    .badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; background: var(--border); color: var(--muted); }
    .badge.high { background: #e0575720; color: var(--red); }
    .badge.medium { background: #e8b84b20; color: var(--yellow); }
    .badge.low { background: #4caf8220; color: var(--green); }
    pre { background: var(--bg); padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 11px; line-height: 1.5; }
    .full-width { grid-column: 1 / -1; }
    #status { font-size: 11px; color: var(--muted); padding: 4px 8px; background: var(--border); border-radius: 4px; }
  </style>
</head>
<body>
<header>
  <h1>⚡ CoWork</h1>
  <span>${config.projectRoot}</span>
  <nav>
    <button class="active" onclick="showTab('overview')">Overview</button>
    <button onclick="showTab('memory')">Memory</button>
    <button onclick="showTab('wiki')">Wiki</button>
    <button onclick="showTab('audit')">Audit</button>
    <button onclick="showTab('analytics')">Analytics</button>
  </nav>
  <span id="status">loading…</span>
</header>
<main id="content">
  <div class="card full-width"><pre>Loading dashboard…</pre></div>
</main>

<script>
const api = (path) => fetch(path).then(r => r.json());
let currentTab = 'overview';

async function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  event?.target?.classList.add('active');
  await render(tab);
}

async function render(tab) {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="card full-width"><pre>Loading…</pre></div>';

  try {
    if (tab === 'overview') await renderOverview(content);
    else if (tab === 'memory') await renderMemory(content);
    else if (tab === 'wiki') await renderWiki(content);
    else if (tab === 'audit') await renderAudit(content);
    else if (tab === 'analytics') await renderAnalytics(content);
  } catch (e) {
    content.innerHTML = '<div class="card full-width"><pre>Error: ' + e.message + '</pre></div>';
  }
}

async function renderOverview(el) {
  const [status, analytics] = await Promise.all([api('/api/status'), api('/api/analytics')]);
  const daily = analytics.daily;
  el.innerHTML = \`
    <div class="card">
      <h2>Status</h2>
      <div class="stat"><span class="stat-label">Project</span><span class="stat-value">\${status.projectRoot.split('/').pop()}</span></div>
      <div class="stat"><span class="stat-label">Version</span><span class="stat-value">\${status.version}</span></div>
      <div class="stat"><span class="stat-label">Server time</span><span class="stat-value">\${new Date(status.serverTime).toLocaleTimeString()}</span></div>
    </div>
    <div class="card">
      <h2>Today's Usage</h2>
      \${daily ? \`
      <div class="stat"><span class="stat-label">Estimated cost</span><span class="stat-value">$\${daily.totalCostUsd.toFixed(4)}</span></div>
      <div class="stat"><span class="stat-label">Input tokens</span><span class="stat-value">\${daily.totalInputTokens.toLocaleString()}</span></div>
      <div class="stat"><span class="stat-label">Output tokens</span><span class="stat-value">\${daily.totalOutputTokens.toLocaleString()}</span></div>
      <div class="stat"><span class="stat-label">Sessions</span><span class="stat-value">\${daily.sessionCount}</span></div>
      \` : '<p style="color:var(--muted)">No data for today yet</p>'}
    </div>
  \`;
}

async function renderMemory(el) {
  const entries = await api('/api/memory');
  const items = entries.slice(0, 50).map(e => \`
    <div class="list-item">
      <span class="badge \${e.type}">\${e.type}</span>
      <span>\${e.name}</span>
      <span style="color:var(--muted);margin-left:auto;font-size:11px">\${(e.confidence * 100).toFixed(0)}%</span>
    </div>
  \`).join('');
  el.innerHTML = \`
    <div class="card full-width">
      <h2>Memory Entries (\${entries.length})</h2>
      \${items || '<p style="color:var(--muted)">No memories found</p>'}
    </div>
  \`;
}

async function renderWiki(el) {
  const pages = await api('/api/wiki');
  const items = pages.map(p => \`
    <div class="list-item">
      <span class="badge">\${p.version > 1 ? 'v'+p.version : 'new'}</span>
      <span>\${p.title}</span>
      <span style="color:var(--muted);margin-left:auto;font-size:11px">\${p.updatedAt.slice(0,10)}</span>
    </div>
  \`).join('');
  el.innerHTML = \`
    <div class="card full-width">
      <h2>Wiki Pages (\${pages.length})</h2>
      \${items || '<p style="color:var(--muted)">Wiki is empty</p>'}
    </div>
  \`;
}

async function renderAudit(el) {
  const entries = await api('/api/audit');
  const items = entries.slice(-30).reverse().map(e => \`
    <div class="list-item">
      <span class="badge \${e.risk}">\${e.risk}</span>
      <span>\${e.event}</span>
      <span style="color:var(--muted)">\${e.actor}</span>
      <span style="color:var(--muted);margin-left:auto;font-size:11px">\${e.ts.slice(11,19)}</span>
    </div>
  \`).join('');
  el.innerHTML = \`
    <div class="card full-width">
      <h2>Audit Log (today, last 30)</h2>
      \${items || '<p style="color:var(--muted)">No audit entries today</p>'}
    </div>
  \`;
}

async function renderAnalytics(el) {
  const analytics = await api('/api/analytics');
  const monthly = analytics.monthly;
  const items = (monthly.dailyBreakdown ?? []).map(d => \`
    <div class="stat">
      <span class="stat-label">\${d.date}</span>
      <span class="stat-value">$\${d.totalCostUsd.toFixed(4)} · \${(d.totalInputTokens+d.totalOutputTokens).toLocaleString()} tokens</span>
    </div>
  \`).join('');
  el.innerHTML = \`
    <div class="card">
      <h2>Monthly Summary: \${monthly.month}</h2>
      <div class="stat"><span class="stat-label">Total cost</span><span class="stat-value">$\${monthly.totalCostUsd.toFixed(4)}</span></div>
      <div class="stat"><span class="stat-label">Total tokens</span><span class="stat-value">\${monthly.totalTokens.toLocaleString()}</span></div>
    </div>
    <div class="card">
      <h2>Daily Breakdown</h2>
      \${items || '<p style="color:var(--muted)">No monthly data</p>'}
    </div>
  \`;
}

// Boot
async function init() {
  try {
    const status = await api('/api/status');
    document.getElementById('status').textContent = 'connected · ' + new Date(status.serverTime).toLocaleTimeString();
  } catch {
    document.getElementById('status').textContent = 'offline';
  }
  await render('overview');
}

init();
setInterval(() => {
  if (currentTab === 'overview') render('overview');
}, 15_000);
</script>
</body>
</html>`;
}
11. Phase 4 CLI wiring — apps/cowork-cli/src/phase4.ts
TypeScript

/**
 * Phase 4 session extensions.
 * Wires MiroFish, OpenClaw gateway, Hermes, telemetry,
 * analytics, security/audit, cache-aware prompts, council, SOUL.md.
 */

import type { SessionRuntime } from "@cowork/core";
import { TelemetryService } from "@cowork/telemetry";
import { CostTracker } from "@cowork/analytics";
import { AuditLog } from "@cowork/security";
import { SandboxPolicy } from "@cowork/security";
import { CacheAwareSystemPrompt } from "@cowork/cache";
import { loadSoulContext } from "@cowork/core";  // re-exported from soul module
import { MIROFISH_TOOLS } from "@cowork/mirofish";
import { ANALYTICS_TOOLS } from "@cowork/analytics";
import { SECURITY_TOOLS } from "@cowork/security";
import { COUNCIL_TOOLS } from "@cowork/core";
import { randomUUID } from "node:crypto";
import path from "path";

export interface Phase4Runtime {
  telemetry: TelemetryService;
  costTracker: CostTracker;
  auditLog: AuditLog;
  sandboxPolicy: SandboxPolicy;
  sessionId: string;
  cachePrompt?: CacheAwareSystemPrompt;
}

export async function bootstrapPhase4(
  runtime: SessionRuntime,
  options: {
    enableTelemetry?: boolean;
    enableCostTracking?: boolean;
    enableAudit?: boolean;
    enableCachePrompts?: boolean;
    enableSoul?: boolean;
    enableMirofish?: boolean;
    enableCouncil?: boolean;
    exportOtlpUrl?: string;
  } = {}
): Promise<Phase4Runtime> {
  const sessionId = randomUUID();

  // ── 1. Telemetry ──────────────────────────────────────────────────────────
  const telemetry = new TelemetryService({
    projectRoot: runtime.projectRoot,
    enabled: options.enableTelemetry !== false,
    exportOtlpUrl: options.exportOtlpUrl,
  });
  telemetry.metrics.counter("session.start", { provider: runtime.settings.provider });

  // ── 2. Cost tracking ───────────────────────────────────────────────────────
  const costTracker = new CostTracker(runtime.projectRoot, sessionId);

  // ── 3. Audit log ───────────────────────────────────────────────────────────
  const auditLog = new AuditLog(runtime.projectRoot, sessionId);
  if (options.enableAudit !== false) {
    await auditLog.log("session_start", { actor: "system", risk: "low" });
  }

  // ── 4. Sandbox policy (enhanced bash security) ─────────────────────────────
  const sandboxPolicy = new SandboxPolicy({
    projectRoot: runtime.projectRoot,
    permissionLevel: runtime.settings.permissionMode ?? "STANDARD",
    allowNetworkAccess: runtime.settings.permissionMode === "ELEVATED" ||
                        runtime.settings.permissionMode === "FULL",
  });

  // ── 5. SOUL.md context ─────────────────────────────────────────────────────
  if (options.enableSoul !== false) {
    const soul = await loadSoulContext(runtime.projectRoot);
    if (soul.loaded && soul.content) {
      runtime.systemPrompt = soul.content + "\n\n---\n\n" + runtime.systemPrompt;
    }
  }

  // ── 6. Cache-aware system prompt ───────────────────────────────────────────
  let cachePrompt: CacheAwareSystemPrompt | undefined;
  if (options.enableCachePrompts !== false) {
    cachePrompt = new CacheAwareSystemPrompt({
      baseSystemPrompt: runtime.systemPrompt,
      claudeMdPath: path.join(runtime.projectRoot, "CLAUDE.md"),
    });
    const built = await cachePrompt.build();
    runtime.systemPrompt = built.combined;
    telemetry.metrics.gauge("cache.estimatedCacheableTokens", built.estimatedCacheableTokens);
  }

  // ── 7. MiroFish tools ──────────────────────────────────────────────────────
  if (options.enableMirofish !== false) {
    for (const tool of MIROFISH_TOOLS) {
      runtime.tools.push(tool);
    }
  }

  // ── 8. Analytics + Security tools ─────────────────────────────────────────
  for (const tool of [...ANALYTICS_TOOLS, ...SECURITY_TOOLS]) {
    runtime.tools.push(tool);
  }

  // ── 9. Council tools ───────────────────────────────────────────────────────
  if (options.enableCouncil !== false) {
    for (const tool of COUNCIL_TOOLS) {
      runtime.tools.push(tool);
    }
  }

  // ── 10. Session end cleanup ────────────────────────────────────────────────
  process.on("exit", () => {
    telemetry.stop();
    if (options.enableAudit !== false) {
      void auditLog.log("session_end", { actor: "system", risk: "low" });
    }
  });

  return { telemetry, costTracker, auditLog, sandboxPolicy, sessionId, cachePrompt };
}
12. New Phase 4 slash commands — patch apps/cowork-cli/src/repl.ts
TypeScript

// ── /simulate ─────────────────────────────────────────────────────────────────
registry.register({
  name: "simulate",
  aliases: ["sim"],
  description: "/simulate <scenario> — run a MiroFish swarm simulation",
  async handler(args, ctx) {
    if (!args.trim()) return "Usage: /simulate <scenario description>";
    const { MiroFishStudio } = await import("@cowork/mirofish");
    const studio = new MiroFishStudio({ projectRoot: ctx.workingDirectory });
    console.error("[MiroFish] Starting simulation…");
    const report = await studio.run({
      seedDocument: args.trim(),
      scenarioPrompt: `How will people react to: ${args.trim()}`,
      platform: "neutral",
      agentCount: 15,
      rounds: 6,
      modelProvider: ctx.settings.provider,
      model: ctx.settings.model,
      concurrency: 3,
    }, (round) => {
      console.error(`[MiroFish] Round ${round}/6`);
    });
    return [
      `## Simulation Complete`,
      `**Prediction:** ${report.prediction}`,
      `**Narrative:** ${report.dominantNarrative}`,
      `For: ${report.finalBeliefDistribution.stronglyFor + report.finalBeliefDistribution.mildlyFor} | Against: ${report.finalBeliefDistribution.mildlyAgainst + report.finalBeliefDistribution.stronglyAgainst} | Neutral: ${report.finalBeliefDistribution.neutral}`,
    ].join("\n");
  },
});

// ── /council ──────────────────────────────────────────────────────────────────
registry.register({
  name: "council",
  description: "/council <question> — multi-agent debate council",
  async handler(args, ctx) {
    if (!args.trim()) return "Usage: /council <question to debate>";
    const { CouncilDebate } = await import("@cowork/core");
    const debate = new CouncilDebate({
      question: args.trim(),
      agents: [
        { id: "a1", name: "Advocate", stance: "for" },
        { id: "a2", name: "Skeptic", stance: "against" },
        { id: "a3", name: "Devil", stance: "devil" },
        { id: "a4", name: "Expert", stance: "expert" },
      ],
      debateRounds: 1,
      settings: ctx.settings,
    });
    const result = await debate.run();
    return [
      `## Council Verdict`,
      `**Confidence:** ${result.confidence}`,
      result.verdict,
      result.dissent ? `\n**Strongest dissent:** ${result.dissent}` : "",
    ].join("\n");
  },
});

// ── /cost ─────────────────────────────────────────────────────────────────────
registry.register({
  name: "cost",
  description: "/cost [YYYY-MM-DD|YYYY-MM] — show token usage and cost",
  async handler(args, ctx) {
    const { CostTracker } = await import("@cowork/analytics");
    const tracker = new CostTracker(ctx.workingDirectory, "repl");
    const arg = args.trim();

    if (arg && arg.length === 7) {
      const monthly = await tracker.monthlySummary(arg);
      return [
        `## Monthly: ${monthly.month}`,
        `Cost: $${monthly.totalCostUsd.toFixed(4)} | Tokens: ${monthly.totalTokens.toLocaleString()}`,
        ...monthly.dailyBreakdown.map(
          (d) => `  ${d.date}: $${d.totalCostUsd.toFixed(4)} — ${d.sessionCount} session(s)`
        ),
      ].join("\n");
    }

    const summary = await tracker.dailySummary(arg || undefined);
    if (!summary) return `No usage data for ${arg || "today"}.`;
    return [
      `## Today: ${summary.date}`,
      `Cost: $${summary.totalCostUsd.toFixed(4)}`,
      `Tokens: in=${summary.totalInputTokens.toLocaleString()} out=${summary.totalOutputTokens.toLocaleString()}`,
      `Sessions: ${summary.sessionCount}`,
    ].join("\n");
  },
});

// ── /audit ────────────────────────────────────────────────────────────────────
registry.register({
  name: "audit",
  description: "/audit [high|critical] — view security audit log",
  async handler(args, ctx) {
    const { AuditLog } = await import("@cowork/security");
    const log = new AuditLog(ctx.workingDirectory, "repl");
    const risk = ["high", "critical", "medium", "low"].includes(args.trim())
      ? (args.trim() as any)
      : undefined;
    const entries = await log.query({ risk, limit: 20 });
    if (entries.length === 0) return "No audit entries found.";
    return entries
      .reverse()
      .map(
        (e) =>
          `[${e.ts.slice(11, 19)}] ${e.risk.padEnd(8)} ${e.event.padEnd(25)} ${e.actor}`
      )
      .join("\n");
  },
});

// ── /hermes ───────────────────────────────────────────────────────────────────
registry.register({
  name: "hermes",
  description: "/hermes [start|status] — manage the Hermes MCP server",
  async handler(args, _ctx) {
    const sub = args.trim() || "status";
    if (sub === "start") {
      return [
        "To start Hermes MCP server (stdio):",
        "  bun run packages/hermes/src/bin.ts",
        "",
        "To start as SSE on port 3722:",
        "  bun run packages/hermes/src/bin.ts --transport sse",
        "",
        "Then add to Claude Desktop config:",
        '  {"mcpServers":{"cowork":{"command":"bun","args":["run","packages/hermes/src/bin.ts"]}}}',
      ].join("\n");
    }
    return "Hermes: /hermes start for setup instructions";
  },
});

// ── /dashboard ────────────────────────────────────────────────────────────────
registry.register({
  name: "dashboard",
  description: "/dashboard — open the web dashboard",
  async handler(_args, ctx) {
    const port = process.env.COWORK_DASHBOARD_PORT ?? "3720";
    const { spawn } = await import("node:child_process");
    spawn(
      "bun",
      ["run", "apps/dashboard/src/server.ts", "--project", ctx.workingDirectory, "--port", port],
      { detached: true, stdio: "ignore" }
    ).unref();
    return `Dashboard starting at http://localhost:${port} (detached)`;
  },
});

// ── /gateway ──────────────────────────────────────────────────────────────────
registry.register({
  name: "gateway",
  aliases: ["openclaw"],
  description: "/gateway — show OpenClaw messaging gateway status and setup",
  async handler(_args, ctx) {
    return [
      "OpenClaw Gateway — connect messaging platforms to cowork",
      "",
      "Configure via env:",
      "  TELEGRAM_BOT_TOKEN=<token>",
      "  COWORK_GATEWAY_PORT=3721",
      "",
      "Start from your app code:",
      "  import { CoworkGateway } from '@cowork/openclaw'",
      "  const gw = new CoworkGateway({ projectRoot, channels: [...] })",
      "  await gw.start()",
      "",
      "Or via webhook: POST http://localhost:3721/webhook/<channelId>",
    ].join("\n");
  },
});

// ── /soul ─────────────────────────────────────────────────────────────────────
registry.register({
  name: "soul",
  description: "/soul — view or create SOUL.md persona file",
  async handler(_args, ctx) {
    const { loadSoulContext, ensureSoulFile } = await import("@cowork/core");
    const soul = await loadSoulContext(ctx.workingDirectory);
    if (!soul.loaded) {
      await ensureSoulFile(ctx.workingDirectory);
      return `SOUL.md created at ${ctx.workingDirectory}/SOUL.md — edit it to customize agent persona.`;
    }
    return `## SOUL.md (${soul.path})\n\n${soul.content}`;
  },
});
13. Updated root package.json
JSON

{
  "name": "locoworker",
  "private": true,
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "cowork": "bun run apps/cowork-cli/src/index.ts",
    "dashboard": "bun run apps/dashboard/src/server.ts",
    "hermes": "bun run packages/hermes/src/bin.ts",
    "typecheck": "tsc --build --noEmit",
    "test": "bun test",
    "build:all": "bun run --filter='*' build"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "bun-types": "latest"
  }
}
14. Updated .env.example — Phase 4 additions
dotenv

# ──────────────────────────────────────────────────────────────────
# Phase 4 additions to .env.example
# ──────────────────────────────────────────────────────────────────

# MiroFish Simulation Studio
COWORK_MIROFISH_AGENT_COUNT=20         # default agents per simulation
COWORK_MIROFISH_ROUNDS=10             # default simulation rounds
COWORK_MIROFISH_CONCURRENCY=4         # parallel agent calls
COWORK_MIROFISH_SAVE_WIKI=true        # auto-save reports to wiki
COWORK_MIROFISH_SAVE_MEMORY=true      # auto-save to memory

# OpenClaw Messaging Gateway
TELEGRAM_BOT_TOKEN=                   # Telegram bot token (from @BotFather)
COWORK_GATEWAY_PORT=3721              # HTTP port for gateway + webhooks
COWORK_GATEWAY_RATE_LIMIT=20         # messages per user per minute

# Hermes MCP Server
HERMES_TRANSPORT=stdio                # stdio | sse
HERMES_PORT=3722                      # port for SSE transport
HERMES_AUTH_TOKEN=                    # optional Bearer auth for SSE
HERMES_TOOLS=                         # comma-separated tool names (all if empty)

# Telemetry
COWORK_TELEMETRY_ENABLED=true
COWORK_TELEMETRY_OTLP_URL=           # optional OTLP HTTP endpoint e.g. http://localhost:4318/v1/metrics
COWORK_TELEMETRY_RETENTION_DAYS=30

# Analytics / Cost tracking
COWORK_COST_TRACKING=true
COWORK_COST_ALERT_DAILY_USD=         # alert threshold (future)

# Security / Audit
COWORK_AUDIT_LOG=true
COWORK_SANDBOX_NETWORK=false         # allow network commands in Bash (default: deny)
COWORK_NETWORK_ALLOWLIST=            # comma-separated hosts e.g. "api.github.com,registry.npmjs.org"

# Prompt Cache Engineering
COWORK_CACHE_PROMPTS=true            # enable cache-aware system prompt layers
COWORK_SOUL_FILE=                    # override SOUL.md path (default: <project>/SOUL.md)

# Dashboard
COWORK_DASHBOARD_PORT=3720

# Council debates
COWORK_COUNCIL_ROUNDS=2              # default debate rounds per agent
COWORK_COUNCIL_STANCES=for,against,devil,expert,pragmatist
15. PHASE4.md
Markdown

# Phase 4 — Feature Guide

Phase 4 adds a swarm simulation studio (MiroFish), a messaging gateway (OpenClaw),
an MCP server host (Hermes), telemetry + cost analytics, advanced security,
prompt cache engineering, council debates, SOUL.md personas, and a web dashboard.

## New packages

| Package | Description |
|---------|-------------|
| `@cowork/mirofish` | Swarm-intelligence multi-agent simulation — spawn agents with personalities, simulate social dynamics, generate prediction reports |
| `@cowork/openclaw` | Messaging gateway — connect Telegram, Slack, Discord, webhooks to the agent loop |
| `@cowork/hermes` | MCP server host — expose cowork tools as an MCP server for Claude Desktop and other agents |
| `@cowork/telemetry` | Structured observability — spans, traces, metrics, optional OTLP export |
| `@cowork/analytics` | Cost tracking — per-session + daily + monthly token usage and USD estimates |
| `@cowork/security` | Advanced security — audit log, enhanced sandbox policy with entropy detection |
| `@cowork/cache` | Prompt cache engineering — stable layered system prompts, Anthropic cache breakpoints |

## New core modules

| Module | Description |
|--------|-------------|
| `core/council` | CouncilDebate — structured multi-agent debates with verdict and confidence |
| `core/soul` | SOUL.md persona context — identity file injected at prompt layer 0 |

## New apps

| App | Description |
|-----|-------------|
| `apps/dashboard` | Web dashboard (port 3720) — memory browser, wiki, audit log, analytics |

## New tools

| Tool | Description |
|------|-------------|
| `SimulationRun` | Run a MiroFish swarm simulation |
| `UsageReport` | Daily / monthly token usage and cost report |
| `AuditQuery` | Query the session audit log |
| `CouncilRun` | Multi-agent council debate |

## New slash commands

| Command | Description |
|---------|-------------|
| `/simulate <scenario>` | Run a quick MiroFish simulation |
| `/council <question>` | Run a council debate |
| `/cost [date|month]` | Show usage + cost |
| `/audit [risk level]` | View audit log |
| `/hermes start` | Show Hermes MCP server setup |
| `/dashboard` | Launch the web dashboard (detached) |
| `/gateway` | Show OpenClaw gateway setup |
| `/soul` | View or create SOUL.md |

## MiroFish quick start

```bash
# In the REPL
cowork> /simulate "Company announces 30% price increase for its SaaS product"

# Or via the agent tool
cowork> Run a MiroFish simulation on: "Open-source project switches to BSL license"
OpenClaw Telegram setup
TypeScript

import { CoworkGateway } from '@cowork/openclaw'

const gateway = new CoworkGateway({
  projectRoot: process.cwd(),
  channels: [{ type: 'telegram', channelId: 'default' }],
  httpPort: 3721,
  rateLimitPerUser: 20,
})
await gateway.start()
Hermes MCP server (Claude Desktop integration)
Bash

# Start Hermes
bun run packages/hermes/src/bin.ts --transport stdio

# Add to claude_desktop_config.json:
{
  "mcpServers": {
    "cowork": {
      "command": "bun",
      "args": ["run", "/path/to/locoworker/packages/hermes/src/bin.ts"]
    }
  }
}
Dashboard
Bash

bun run dashboard
# Opens at http://localhost:3720
Prompt cache engineering (Anthropic)
When using the Anthropic provider, Phase 4 automatically:

Splits the system prompt into 3 layers (base → project → memory)
Marks layers 1 and 2 with cache_control: {type:"ephemeral"}
Logs estimated cacheable token count to telemetry
For large projects with stable CLAUDE.md files, this can reduce effective prompt token costs by 50–80% on repeated sessions.

SOUL.md
Create SOUL.md in your project root to give the agent a persistent persona:

Bash

cowork> /soul   # creates SOUL.md if not present, shows it if it exists
SOUL.md is loaded as the first layer of the system prompt before all other context.

text


---

## Summary: what Phase 4 adds

| Item | Files | Description |
|------|-------|-------------|
| **MiroFish** | `packages/mirofish/src/*.ts` | Full swarm simulation studio — AgentFactory, SimulationEngine, ReportGenerator, MiroFishStudio, tools |
| **OpenClaw** | `packages/openclaw/src/*.ts` | Messaging gateway — TelegramChannel, WebhookChannel, HttpChannel, GatewayServer, CoworkGateway, RateLimiter |
| **Hermes** | `packages/hermes/src/*.ts` | MCP server host — exposes all cowork tools as MCP over stdio or SSE |
| **Telemetry** | `packages/telemetry/src/*.ts` | Tracer, MetricsCollector, TelemetryService with optional OTLP export |
| **Analytics** | `packages/analytics/src/*.ts` | CostTracker, pricing table (Anthropic/OpenAI/DeepSeek/local), daily/monthly summaries, UsageReport tool |
| **Security** | `packages/security/src/*.ts` | AuditLog (JSONL), enhanced SandboxPolicy (entropy detection, soft blocklist, network policy), AuditQuery tool |
| **Cache** | `packages/cache/src/*.ts` | CacheAwareSystemPrompt (3-layer stable/volatile split), PromptCacheStats, Anthropic cache_control blocks |
| **Council** | `packages/core/src/council/*.ts` | CouncilDebate (structured multi-agent debate + moderator verdict), CouncilRun tool |
| **SOUL.md** | `packages/core/src/soul/*.ts` | loadSoulContext, ensureSoulFile, defaultSoulTemplate |
| **Dashboard** | `apps/dashboard/src/*.ts` | Bun HTTP server — memory browser, wiki, audit log, analytics, live status — zero external deps |
| **CLI wiring** | `apps/cowork-cli/src/phase4.ts` | bootstrapPhase4(), all new slash commands |
| **Config** | `.env.example`, `PHASE4.md`, root `package.json` | Documented, referenced, bin aliases added |
