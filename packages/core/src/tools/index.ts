import type { ToolDefinition } from "../Tool.js";
import { BashTool } from "./bash/BashTool.js";
import { ReadFileTool } from "./files/ReadFileTool.js";
import { WriteFileTool } from "./files/WriteFileTool.js";
import { EditFileTool } from "./files/EditFileTool.js";
import { GlobTool } from "./files/GlobTool.js";
import { GrepTool } from "./files/GrepTool.js";

export const DEFAULT_TOOLS: ToolDefinition[] = [
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  GlobTool,
  GrepTool,
  BashTool,
];

export function buildToolMap(tools: ToolDefinition[]): Map<string, ToolDefinition> {
  return new Map(tools.map((t) => [t.name, t]));
}

export * from "./memory/index.js";

export {
  BashTool,
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  GlobTool,
  GrepTool,
};
