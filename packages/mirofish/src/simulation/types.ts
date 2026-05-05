import type { SimAgentMessage } from "../agents/SimAgent.js";

export interface SimulationConfig {
  name: string;
  scenario: string;
  agents: Array<{ name: string; role: string; systemPrompt: string }>;
  rounds: number;
  concurrency?: number;
  saveToWiki?: boolean;
  saveToMemory?: boolean;
}

export interface RoundResult {
  round: number;
  messages: SimAgentMessage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
}

export interface SimulationResult {
  id: string;
  config: SimulationConfig;
  rounds: RoundResult[];
  summary?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  completedAt: string;
}
