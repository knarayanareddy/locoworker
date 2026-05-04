/**
 * Council: runs a structured multi-agent debate.
 * Multiple agents (with distinct "stances") argue for and against a position,
 * then a moderator synthesizes a verdict.
 */
import type { ResolvedSettings } from "../settings/types";
export type CouncilStance = "for" | "against" | "neutral" | "devil" | "expert" | "pragmatist";
export interface CouncilAgent {
    id: string;
    name: string;
    stance: CouncilStance;
    domain?: string;
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
    debateRounds?: number;
    settings: ResolvedSettings;
    verbose?: boolean;
}
export declare class CouncilDebate {
    private config;
    private engine;
    constructor(config: CouncilConfig);
    run(): Promise<CouncilVerdict>;
}
//# sourceMappingURL=CouncilDebate.d.ts.map