import type { MemorySystem } from "../memdir/MemorySystem.js";
import type { QueryEngine } from "../QueryEngine.js";
import type { ContextCompressor } from "../services/compact/ContextCompressor.js";

export type SlashCommandContext = {
  memory: MemorySystem;
  engine: QueryEngine;
  compressor: ContextCompressor;
  sessionId: string;
  workingDirectory: string;
};

export type SlashOutput =
  | { type: "text"; text: string }
  | { type: "exit" }
  | { type: "clear" };

export interface SlashCommand {
  name: string;
  summary: string;
  usage?: string;
  execute(args: string[], ctx: SlashCommandContext): Promise<SlashOutput>;
}
