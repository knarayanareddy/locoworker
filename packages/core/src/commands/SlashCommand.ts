// packages/core/src/commands/SlashCommand.ts
// Slash command type definition — extended with Phase 5 context fields.

import type { QueryEngine } from "../QueryEngine.js";
import type { ContextCompressor } from "../services/compact/ContextCompressor.js";
import type { MemorySystem } from "../memdir/MemorySystem.js";
import type { SessionManager } from "../session/SessionManager.js";
import type { SkillRegistry } from "../skills/SkillRegistry.js";

export interface SlashCommandContext {
  sessionId: string;
  workingDirectory: string;
  memory: MemorySystem;
  engine: QueryEngine;
  compressor?: ContextCompressor;
  sessionManager?: SessionManager;
  skills?: SkillRegistry;
  /** Print a line to the user (stdout) */
  print: (line: string) => void;
  /** Run a normal agent turn with the given prompt */
  runTurn: (prompt: string) => Promise<void>;
}

export interface SlashCommand {
  name: string;
  description: string;
  summary?: string;
  usage?: string;
  execute(args: string[], ctx: SlashCommandContext): Promise<void>;
}
