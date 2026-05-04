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
