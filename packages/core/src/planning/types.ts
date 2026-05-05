export type PlanningMode = "react" | "beam" | "none";

export interface ReActStep {
  thought: string;
  action: string;
  actionInput: unknown;
  observation?: string;
}

export interface BeamCandidate {
  plan: string[];
  score: number;
  tokens: number;
}

export interface PlanningConfig {
  mode: PlanningMode;
  beamWidth?: number;
  maxPlanningSteps?: number;
  maxReactCycles?: number;
}
