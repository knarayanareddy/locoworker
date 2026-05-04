export type AgentPersonality = "adopter" | "skeptic" | "neutral" | "influencer" | "expert" | "troll" | "lurker";
export type PlatformType = "twitter" | "reddit" | "slack" | "neutral";
export type ActionType = "post" | "reply" | "like" | "repost" | "follow" | "ignore" | "disagree" | "endorse" | "question";
export interface SimAgent {
    id: string;
    name: string;
    personality: AgentPersonality;
    bio: string;
    beliefScore: number;
    influenceScore: number;
    memory: string[];
    followedBy: string[];
    following: string[];
}
export interface SimAction {
    agentId: string;
    round: number;
    action: ActionType;
    targetAgentId?: string;
    content: string;
    timestamp: string;
    beliefDelta: number;
}
export interface SimulationConfig {
    seedDocument: string;
    scenarioPrompt: string;
    platform: PlatformType;
    agentCount: number;
    rounds: number;
    modelProvider: string;
    model: string;
    concurrency: number;
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
    topInfluencers: Array<{
        name: string;
        personality: AgentPersonality;
        beliefScore: number;
    }>;
    keyMoments: string[];
    prediction: string;
    rawMarkdown: string;
}
//# sourceMappingURL=types.d.ts.map