// packages/core/src/session/SessionRecord.ts
// On-disk record for a named agent session.

export type SessionStatus = "active" | "completed" | "error";

export interface SessionRecord {
  /** Unique session ID */
  id: string;
  /** Human-readable name (may be auto-generated from first message) */
  name: string;
  /** Project root at time of creation */
  projectRoot: string;
  /** Provider used */
  provider: string;
  /** Model used */
  model: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Status */
  status: SessionStatus;
  /** Summary of what was accomplished (populated on completion or /compact) */
  summary?: string;
  /** Total token usage across all turns */
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Number of turns */
  turns: number;
}
