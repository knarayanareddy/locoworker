/**
 * Memory architecture — spec PART 6.
 *
 * Four typed memory categories. Each entry lives as a single Markdown file
 * under ~/.cowork/projects/<project>/memory/<type>/<id>.md and is summarized
 * in MEMORY.md (the always-loaded index, hard-capped at 200 lines).
 */

export type MemoryType = "user" | "feedback" | "project" | "reference";

export const MEMORY_TYPES: readonly MemoryType[] = [
  "user",
  "feedback",
  "project",
  "reference",
];

export type MemoryEntry = {
  id: string;
  type: MemoryType;
  name: string;
  description: string;
  body: string;
  tags: string[];
  createdAt: string; // ISO-8601 absolute date
  updatedAt: string;
  sessionId: string | null;
  /** Confidence the entry is still accurate. AutoDream may decay or boost this. */
  confidence: number;
};

export type MemoryDraft = Omit<MemoryEntry, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

export type MemoryFilter = {
  type?: MemoryType;
  tags?: string[];
  query?: string;
  limit?: number;
};

export const DESCRIPTIONS: Record<MemoryType, string> = {
  user:
    "Who the user is, their role, expertise, preferences. Tailors how the agent communicates and what it can assume.",
  feedback:
    "Corrections and validated approaches. 'Don't do X' and 'yes, keep doing Y'. Should include the reason and when it applies.",
  project:
    "Decisions, deadlines, ownership, and motivations specific to the current work. Decays quickly — reverify against current state.",
  reference:
    "Pointers to external systems where authoritative information lives (Linear, dashboards, runbooks, etc).",
};

export function isMemoryType(s: string): s is MemoryType {
  return (MEMORY_TYPES as readonly string[]).includes(s);
}
