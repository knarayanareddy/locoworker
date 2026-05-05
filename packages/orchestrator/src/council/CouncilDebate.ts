import { queryLoop } from "@cowork/core";
import type { QueryEngine, ToolDefinition } from "@cowork/core";

export interface CouncilMember {
  name: string;
  role: string;
  systemPrompt: string;
  perspective?: string;
}

export interface DebateRound {
  memberId: string;
  memberName: string;
  argument: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CouncilResult {
  question: string;
  members: CouncilMember[];
  rounds: DebateRound[][];
  consensus?: string;
  dissent?: string[];
  verdict: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
}

const DEFAULT_MEMBERS: CouncilMember[] = [
  {
    name: "Architect",
    role: "Systems architect",
    systemPrompt:
      "You are a systems architect. Evaluate proposals for technical soundness, scalability, and maintainability. Be rigorous and precise.",
    perspective: "technical correctness and long-term maintainability",
  },
  {
    name: "Pragmatist",
    role: "Pragmatic engineer",
    systemPrompt:
      "You are a pragmatic engineer. Evaluate proposals for simplicity, delivery speed, and practical tradeoffs. Challenge over-engineering.",
    perspective: "simplicity and delivery speed",
  },
  {
    name: "Skeptic",
    role: "Critical reviewer",
    systemPrompt:
      "You are a critical reviewer. Identify risks, failure modes, edge cases, and unstated assumptions. Be constructively critical.",
    perspective: "risk identification and failure modes",
  },
];

export class CouncilDebate {
  constructor(
    private engine: QueryEngine,
    private tools: ToolDefinition[],
    private members: CouncilMember[] = DEFAULT_MEMBERS
  ) {}

  async debate(
    question: string,
    opts?: { rounds?: number; maxTokensPerTurn?: number }
  ): Promise<CouncilResult> {
    const start = Date.now();
    const numRounds = opts?.rounds ?? 2;
    const allRounds: DebateRound[][] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let priorArguments = "";

    for (let round = 0; round < numRounds; round++) {
      const roundResults: DebateRound[] = [];

      for (const member of this.members) {
        const prompt =
          round === 0
            ? [
                `Question for council debate:`,
                ``,
                question,
                ``,
                `State your position from your perspective as ${member.role}.`,
                `Be specific, concrete, and focused on "${member.perspective}".`,
                `Keep your response under 300 words.`,
              ].join("\n")
            : [
                `Council debate — Round ${round + 1}`,
                ``,
                `Original question: ${question}`,
                ``,
                `Previous arguments:`,
                priorArguments,
                ``,
                `Respond to the other council members' arguments from your perspective as ${member.role}.`,
                `You may update your position, defend it, or find common ground.`,
                `Keep your response under 200 words.`,
              ].join("\n");

        let argument = "";
        let inputTokens = 0;
        let outputTokens = 0;

        try {
          for await (const event of queryLoop(prompt, {
            engine: this.engine,
            systemPrompt: member.systemPrompt,
            tools: [],
            maxTurns: 1,
            maxTokens: opts?.maxTokensPerTurn ?? 600,
          })) {
            if (event.type === "text") argument += event.text;
            if (event.type === "complete") {
              inputTokens = event.usage?.inputTokens ?? 0;
              outputTokens = event.usage?.outputTokens ?? 0;
            }
          }
        } catch (err) {
          argument = `[${member.name} could not respond: ${err instanceof Error ? err.message : String(err)}]`;
        }

        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        roundResults.push({
          memberId: member.name.toLowerCase(),
          memberName: member.name,
          argument,
          inputTokens,
          outputTokens,
        });
      }

      allRounds.push(roundResults);
      priorArguments = allRounds
        .flat()
        .map((r) => `**${r.memberName}**: ${r.argument}`)
        .join("\n\n");
    }

    const verdict = await this.synthesizeVerdict(question, priorArguments);
    totalInputTokens += verdict.inputTokens;
    totalOutputTokens += verdict.outputTokens;

    return {
      question,
      members: this.members,
      rounds: allRounds,
      verdict: verdict.text,
      totalInputTokens,
      totalOutputTokens,
      durationMs: Date.now() - start,
    };
  }

  private async synthesizeVerdict(
    question: string,
    arguments_: string
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const prompt = [
      `You are a council moderator. Given the following debate, synthesize a final verdict.`,
      ``,
      `Question: ${question}`,
      ``,
      `Council arguments:`,
      arguments_,
      ``,
      `Produce:`,
      `1. A CONSENSUS statement where members agree`,
      `2. A VERDICT with the recommended course of action`,
      `3. Any key CAVEATS or DISSENTING points to keep in mind`,
      ``,
      `Format:`,
      `CONSENSUS: <what everyone agreed on>`,
      `VERDICT: <recommended action>`,
      `CAVEATS: <important caveats or dissent>`,
    ].join("\n");

    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const event of queryLoop(prompt, {
        engine: this.engine,
        systemPrompt: "You are an impartial council moderator producing clear, actionable verdicts.",
        tools: [],
        maxTurns: 1,
        maxTokens: 800,
      })) {
        if (event.type === "text") text += event.text;
        if (event.type === "complete") {
          inputTokens = event.usage?.inputTokens ?? 0;
          outputTokens = event.usage?.outputTokens ?? 0;
        }
      }
    } catch {
      text = "Council failed to reach a verdict.";
    }

    return { text, inputTokens, outputTokens };
  }
}
