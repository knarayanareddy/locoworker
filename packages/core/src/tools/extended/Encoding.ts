import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";

export const Base64Encode: ToolDefinition = {
  name: "Base64Encode",
  description: "Encode a string to base64.",
  inputSchema: {
    type: "object",
    properties: { input: { type: "string" } },
    required: ["input"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { input: string }) {
    return { content: Buffer.from(input.input).toString("base64"), isError: false };
  },
};

export const Base64Decode: ToolDefinition = {
  name: "Base64Decode",
  description: "Decode a base64 string.",
  inputSchema: {
    type: "object",
    properties: { input: { type: "string" } },
    required: ["input"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { input: string }) {
    try {
      return { content: Buffer.from(input.input, "base64").toString("utf8"), isError: false };
    } catch {
      return { content: "Invalid base64", isError: true };
    }
  },
};
