import type { SimulationState, SimulationReport, SimAgent } from "./types";
import { QueryEngine, resolveProvider } from "@cowork/core";

export class ReportGenerator {
  private engine: QueryEngine;

  constructor(state: SimulationState) {
    const cfg = resolveProvider({
      provider: state.config.modelProvider as any,
      model: state.config.model,
    });
    this.engine = new QueryEngine(cfg);
  }

  async generate(state: SimulationState): Promise<SimulationReport> {
    const { agents, actions, config } = state;

    const dist = this.computeBeliefDistribution(agents);

    const topInfluencers = agents
      .sort((a, b) => b.influenceScore * b.followedBy.length - a.influenceScore * a.followedBy.length)
      .slice(0, 5)
      .map((a) => ({ name: a.name, personality: a.personality, beliefScore: a.beliefScore }));

    const keyMoments = actions
      .sort((a, b) => Math.abs(b.beliefDelta) - Math.abs(a.beliefDelta))
      .slice(0, 8)
      .map((a) => {
        const agent = agents.find((ag) => ag.id === a.agentId);
        return `Round ${a.round} — ${agent?.name ?? a.agentId} (${agent?.personality}): "${a.content}" [Δ${a.beliefDelta > 0 ? "+" : ""}${(a.beliefDelta * 100).toFixed(0)}%]`;
      });

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
