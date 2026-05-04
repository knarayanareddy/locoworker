// packages/core/src/commands/skills.ts

// Slash commands: /skill list | /skill show <name> | /skill <name> [input]

import type { SlashCommand } from "./SlashCommand.js";

export const skillCommand: SlashCommand = {
  name: "skill",
  description:
    "Invoke or list skills. Usage: /skill list | /skill show <name> | /skill <name> [input]",
  async execute(args, ctx) {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];

    if (!ctx.skills) {
      ctx.print("Skills registry not available in this context.");
      return;
    }

    if (!sub || sub === "list") {
      const skills = ctx.skills.list();
      if (skills.length === 0) {
        ctx.print(
          "No skills registered. Add .md files to ~/.cowork/skills/ or <project>/.cowork/skills/"
        );
        return;
      }
      ctx.print(`\nAvailable skills (${skills.length}):\n`);
      for (const s of skills) {
        const tags = s.tags?.length ? `  [${s.tags.join(", ")}]` : "";
        ctx.print(`  /skill ${s.name.padEnd(20)}  ${s.description}${tags}`);
      }
      ctx.print("");
      return;
    }

    if (sub === "show") {
      const name = parts[1];
      if (!name) { ctx.print("Usage: /skill show <name>"); return; }
      const skill = ctx.skills.get(name);
      if (!skill) { ctx.print(`Skill "${name}" not found.`); return; }
      ctx.print(`\n## Skill: ${skill.name}`);
      ctx.print(`Description: ${skill.description}`);
      if (skill.tags?.length) ctx.print(`Tags: ${skill.tags.join(", ")}`);
      if (skill.preferredModel) ctx.print(`Model: ${skill.preferredModel}`);
      ctx.print(`\nTemplate:\n${skill.template}\n`);
      return;
    }

    // Invoke: /skill <name> [input...]
    const name = sub;
    const input = parts.slice(1).join(" ");
    const invocation = ctx.skills.invoke(name, input);
    if (!invocation) {
      ctx.print(`Skill "${name}" not found. Run /skill list to see available skills.`);
      return;
    }

    ctx.print(`\n[Invoking skill: ${name}]\n`);
    // Dispatch the resolved prompt as a normal user turn
    await ctx.runTurn(invocation.resolvedPrompt);
  },
};
