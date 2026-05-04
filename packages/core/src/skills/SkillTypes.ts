// packages/core/src/skills/SkillTypes.ts

export interface Skill {
  /** Unique identifier (used in /skill <name>) */
  name: string;
  /** Short human-readable description */
  description: string;
  /** The prompt template. Use {{INPUT}} as a placeholder for user input. */
  template: string;
  /** Optional: model to prefer for this skill */
  preferredModel?: string;
  /** Optional: tags for discovery */
  tags?: string[];
}

export interface SkillInvocation {
  skill: Skill;
  /** Resolved prompt (template with {{INPUT}} substituted) */
  resolvedPrompt: string;
}
