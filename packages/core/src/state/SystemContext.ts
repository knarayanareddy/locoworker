import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MemorySystem } from "../memdir/MemorySystem.js";

const MAX_CLAUDE_MD = 12_000;

/**
 * Assemble the full system prompt by stacking:
 *   1. Base agent identity prompt (always-present)
 *   2. Project CLAUDE.md (if present)
 *   3. MEMORY.md index (if any memories exist)
 *
 * Order matters for prompt caching (spec PART 20): the base prompt is
 * cache-stable, the project section is cache-stable per project, and
 * MEMORY.md sits at the boundary because it changes whenever a memory
 * is added.
 */
export async function assembleSystemPrompt(
  basePrompt: string,
  projectRoot: string,
  memory: MemorySystem | null,
): Promise<string> {
  const parts: string[] = [basePrompt];

  const claudeMd = await tryRead(join(projectRoot, "CLAUDE.md"));
  if (claudeMd) {
    parts.push(`\n\n# Project context (CLAUDE.md)\n\n${truncate(claudeMd, MAX_CLAUDE_MD)}`);
  }

  if (memory) {
    const index = await memory.readIndex();
    if (index.trim().length > 0) {
      parts.push(
        `\n\n# Long-term memory index (MEMORY.md)\n\nUse the MemorySearch tool to read full entries. The index below is just pointers.\n\n${index}`,
      );
    }
  }

  return parts.join("");
}

async function tryRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[CLAUDE.md truncated at ${max} chars]`;
}
