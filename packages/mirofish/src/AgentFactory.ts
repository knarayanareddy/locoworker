import type { SimAgent, AgentPersonality, SimulationConfig } from "./types";
import { QueryEngine, resolveProvider } from "@cowork/core";

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
      provider: config.modelProvider as any,
      model: config.model,
    });
    this.engine = new QueryEngine(providerCfg);
  }

  async generateAgents(
    seedDocument: string,
    count: number
  ): Promise<SimAgent[]> {
    const mix = this.buildPersonalityMix(count);
    const agents: SimAgent[] = [];

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
      personas = this.fallbackPersonas(count, mix);
    }

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
    mix.neutral += total - assigned;
    return mix;
  }

  private wireNetwork(agents: SimAgent[]): void {
    for (const agent of agents) {
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
