import type { ToolDefinition } from "../Tool.js";
import { BashTool } from "./bash/BashTool.js";
import { ReadFileTool } from "./files/ReadFileTool.js";
import { WriteFileTool } from "./files/WriteFileTool.js";
import { EditFileTool } from "./files/EditFileTool.js";
import { GlobTool } from "./files/GlobTool.js";
import { GrepTool } from "./files/GrepTool.js";
export declare const DEFAULT_TOOLS: ToolDefinition[];
export declare function buildToolMap(tools: ToolDefinition[]): Map<string, ToolDefinition>;
export { BashTool, ReadFileTool, WriteFileTool, EditFileTool, GlobTool, GrepTool, };
//# sourceMappingURL=index.d.ts.map