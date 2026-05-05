// packages/core/src/skills/types.ts

export type SkillKind = "prompt" | "shell";

export interface Skill {
  name: string;
  description: string;
  kind: SkillKind;
  /** For kind=prompt: the prompt text to inject. */
  prompt?: string;
  /** For kind=shell: the shell command to run. */
  command?: string;
  /** Optional param names the caller should fill in before execution. */
  params?: string[];
}
