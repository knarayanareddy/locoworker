import { queryLoop } from "../queryLoop.js";
import type { QueryEngine } from "../QueryEngine.js";
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
        if (event.type === "complete") inputTokens = event.usage?.inputTokens ?? 0;
      }
    } catch {
      return [{ plan: [prompt], score: 1.0, tokens: 0 }];
    }

    return this.parseCandidates(rawOutput, inputTokens);
  }

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
