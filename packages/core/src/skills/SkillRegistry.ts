// packages/core/src/skills/SkillRegistry.ts

import { join, resolve } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Skill } from "./types.js";

export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private skillsDir: string;

  constructor(projectRoot: string) {
    this.skillsDir = join(resolve(projectRoot), ".cowork", "skills");
  }

  async load(): Promise<void> {
    if (!existsSync(this.skillsDir)) return;

    try {
      const files = await readdir(this.skillsDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      await Promise.all(
        jsonFiles.map(async (file) => {
          try {
            const raw = await readFile(join(this.skillsDir, file), "utf-8");
            const skill = JSON.parse(raw) as Skill;
            if (skill.name) {
              this.skills.set(skill.name, skill);
            }
          } catch {
            // skip malformed skill files
          }
        })
      );
    } catch {
      // skills dir unreadable — that's fine
    }
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }

  invoke(name: string, input: string): { resolvedPrompt: string } | null {
    const skill = this.skills.get(name);
    if (!skill) return null;

    if (skill.kind === "prompt") {
      let resolvedPrompt = skill.prompt ?? "";
      if (skill.params) {
        for (const p of skill.params) {
          // Simplistic replacement for now
          resolvedPrompt = resolvedPrompt.replace(new RegExp(`\\{\\{${p}\\}\\}`, "g"), input);
        }
      } else {
        resolvedPrompt += `\n\nInput: ${input}`;
      }
      return { resolvedPrompt };
    }

    if (skill.kind === "shell") {
      const command = skill.command?.replace("{{input}}", input) ?? "";
      return { resolvedPrompt: `Run shell command: ${command}` };
    }

    return null;
  }
}
