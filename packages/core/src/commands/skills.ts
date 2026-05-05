import type { SlashCommand } from "./SlashCommand.js";

export const skillsCommand: SlashCommand = {
  name: "skills",
  description: "List available skills in .cowork/skills/.",
  usage: "/skills",
  async execute(args, ctx) {
    if (!ctx.skills) {
      ctx.print("Skill registry not available.");
      return;
    }

    const skills = ctx.skills.list();
    if (skills.length === 0) {
      ctx.print([
        "No skills found.",
        "Add JSON files to .cowork/skills/ to create skills.",
        "",
        "Example skill file (.cowork/skills/test-runner.json):",
        JSON.stringify({
          name: "test-runner",
          description: "Run the project test suite",
          kind: "shell",
          command: "bun test 2>&1",
        }, null, 2),
      ].join("\n"));
      return;
    }

    const lines = skills.map(
      (s) => `  • ${s.name.padEnd(20)} [${s.kind}]  ${s.description}`
    );
    ctx.print([`Skills (${skills.length}):`, ...lines].join("\n"));
  },
};
