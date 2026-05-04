/**
 * Council: runs a structured multi-agent debate.
 * Multiple agents (with distinct "stances") argue for and against a position,
 * then a moderator synthesizes a verdict.
 */

import { QueryEngine } from "../QueryEngine";
import { resolveProvider } from "../providers";
import type { ResolvedSettings } from "../settings/types";

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
