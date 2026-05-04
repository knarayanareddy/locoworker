// packages/core/src/skills/SkillRegistry.ts
// Manages named skills that can be loaded from disk or registered in code.

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { Skill, SkillInvocation } from "./SkillTypes.js";

const SKILLS_DIR_NAME = ".cowork/skills";

export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();
  private readonly skillsDir: string;

  constructor(projectRoot?: string) {
    this.skillsDir = projectRoot
      ? join(projectRoot, SKILLS_DIR_NAME)
      : join(homedir(), SKILLS_DIR_NAME);
  }

  /** Register a skill programmatically. */
  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  /** Load skills from ~/.cowork/skills/*.md and <project>/.cowork/skills/*.md */
  async load(): Promise<void> {
    // Global skills
    await this.loadDir(join(homedir(), SKILLS_DIR_NAME));
    // Project skills (override global)
    await this.loadDir(this.skillsDir);
  }

  private async loadDir(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return; // dir doesn't exist yet — that's fine
    }
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const content = await readFile(join(dir, entry), "utf8").catch(() => null);
      if (!content) continue;
      const skill = parseSkillFile(content, basename(entry, ".md"));
      if (skill) this.skills.set(skill.name, skill);
    }
  }

  /** Save a skill to the project skills directory. */
  async save(skill: Skill): Promise<void> {
    await mkdir(this.skillsDir, { recursive: true });
    const content = serializeSkill(skill);
    await writeFile(join(this.skillsDir, `${skill.name}.md`), content, "utf8");
    this.skills.set(skill.name, skill);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return [...this.skills.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  invoke(name: string, input: string): SkillInvocation | null {
    const skill = this.skills.get(name);
    if (!skill) return null;
    const resolvedPrompt = skill.template.replace(/\{\{INPUT\}\}/g, input);
    return { skill, resolvedPrompt };
  }
}

// ── Skill file format ────────────────────────────────────────────────────────
// Skills are stored as markdown files with YAML-like frontmatter:
//
//   ---
//   name: refactor
//   description: Suggest a refactor for the given code
//   tags: refactor, code
//   ---
//   Please refactor the following code to improve readability: {{INPUT}}

function parseSkillFile(content: string, fallbackName: string): Skill | null {
  if (!content.startsWith("---")) {
    // No frontmatter: treat entire content as template, filename as name
    return { name: fallbackName, description: "", template: content.trim() };
  }

  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;

  const frontmatter = content.slice(3, end).trim();
  const template = content.slice(end + 4).trim();

  const fields: Record<string, string> = {};
  for (const line of frontmatter.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    fields[key] = value;
  }

  return {
    name: fields["name"] ?? fallbackName,
    description: fields["description"] ?? "",
    template,
    preferredModel: fields["preferredModel"],
    tags: fields["tags"] ? fields["tags"].split(",").map((t) => t.trim()) : undefined,
  };
}

function serializeSkill(skill: Skill): string {
  const lines = ["---", `name: ${skill.name}`, `description: ${skill.description}`];
  if (skill.tags?.length) lines.push(`tags: ${skill.tags.join(", ")}`);
  if (skill.preferredModel) lines.push(`preferredModel: ${skill.preferredModel}`);
  lines.push("---", "", skill.template);
  return lines.join("\n");
}
