import type { KairosTask } from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function defaultKairosTasks(): KairosTask[] {
  return [
    {
      id: "dream:nightly",
      name: "Nightly Dream (memory consolidation)",
      description: "Runs AutoDream mechanical pass to deduplicate and consolidate memories",
      intervalMs: 6 * HOUR,
      enabled: true,
      runImmediately: false,
    },
    {
      id: "digest:daily",
      name: "Daily Digest",
      description: "Summarises today's transcript sessions into a memory entry",
      intervalMs: DAY,
      enabled: true,
      runImmediately: false,
    },
    {
      id: "gc:transcripts",
      name: "Transcript garbage collector",
      description: "Purges transcript files older than 90 days",
      intervalMs: 7 * DAY,
      enabled: true,
      runImmediately: false,
    },
  ];
}
