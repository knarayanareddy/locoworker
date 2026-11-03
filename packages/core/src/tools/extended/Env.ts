import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import { displayEnvValue, filterEnv } from "@cowork/security/env";

const MAX_OUTPUT_CHARS = 20_000;

export const EnvRead: ToolDefinition = {
  name: "EnvRead",
  description:
    "Read non-sensitive environment variables. Credential-like variables are always redacted and are never passed to child processes.",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string" } },
  },
  permissionLevel: PermissionLevel.CONSTRAINED,
  async execute(input: { name?: string }) {
    if (input.name) {
      const value = process.env[input.name];
      if (value === undefined) return { content: `${input.name}=`, isError: false };
      return { content: displayEnvValue(input.name, value), isError: false };
    }
    // Display only: values are redacted by displayEnvValue, and no child
    // process ever receives this copy.
    const safe = filterEnv(process.env, { mode: "denylist" });
    const text = Object.keys(safe)
      .sort()
      .map((k) => displayEnvValue(k, safe[k]))
      .join("\n");
    return { content: text.slice(0, MAX_OUTPUT_CHARS), isError: false };
  },
};
