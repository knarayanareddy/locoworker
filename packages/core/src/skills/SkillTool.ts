// packages/core/src/skills/SkillTool.ts

import { spawn } from "node:child_process";
import type { ToolDefinition, ExecutionContext } from "../Tool.js";
import { PermissionLevel } from "../permissions/index.js";
import type { SkillRegistry } from "./SkillRegistry.js";

export function makeSkillTool(registry: SkillRegistry): ToolDefinition {
  return {
    name: "skill",
    description:
      "Execute a named skill from the project's .cowork/skills/ directory. " +
      "Use skill_list to discover available skills first.",
    permissionLevel: PermissionLevel.STANDARD,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the skill to execute.",
        },
        params: {
          type: "object",
          description: "Key/value parameters to interpolate into the skill.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["name"],
    },
    async execute(input: { name: string; params?: Record<string, string> }, _ctx: ExecutionContext) {
      const skill = registry.get(input.name);
      if (!skill) {
        return {
          content: `Skill "${input.name}" not found. Available: ${registry.list().map((s) => s.name).join(", ") || "none"}`,
          isError: true,
        };
      }

      if (skill.kind === "prompt") {
        // Interpolate params into the prompt text
        let text = skill.prompt ?? "";
        for (const [k, v] of Object.entries(input.params ?? {})) {
          text = text.replaceAll(`{{${k}}}`, v);
        }
        return { content: text, isError: false };
      }

      if (skill.kind === "shell") {
        let cmd = skill.command ?? "";
        for (const [k, v] of Object.entries(input.params ?? {})) {
          cmd = cmd.replaceAll(`{{${k}}}`, v);
        }
        return new Promise<{ content: string; isError: boolean }>((resolve) => {
          const proc = spawn("/bin/bash", ["-c", cmd], {
            timeout: 30_000,
            stdio: "pipe",
          });
          let stdout = "";
          let stderr = "";
          proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
          proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
          proc.on("close", (code) => {
            const output = [stdout, stderr].filter(Boolean).join("\n").slice(0, 8_000);
            resolve({ content: output || `Exit code ${code}`, isError: code !== 0 });
          });
          proc.on("error", (err) => {
            resolve({ content: err.message, isError: true });
          });
        });
      }

      return { content: `Unknown skill kind: ${skill.kind}`, isError: true };
    },
  };
}

export function makeSkillListTool(registry: SkillRegistry): ToolDefinition {
  return {
    name: "skill_list",
    description: "List all available skills in the project's .cowork/skills/ directory.",
    permissionLevel: PermissionLevel.READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    async execute(_input, _ctx) {
      const skills = registry.list();
      if (skills.length === 0) {
        return {
          content: "No skills found. Add JSON skill files to .cowork/skills/ to create skills.",
          isError: false,
        };
      }
      const lines = skills.map(
        (s) => `• ${s.name} [${s.kind}]: ${s.description}`
      );
      return { content: lines.join("\n"), isError: false };
    },
  };
}
