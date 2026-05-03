import type { ToolDefinition } from "../../Tool.js";
import type { MemorySystem } from "../../memdir/MemorySystem.js";
import { makeMemorySaveTool } from "./MemorySaveTool.js";
import { makeMemorySearchTool } from "./MemorySearchTool.js";
import { makeMemoryDeleteTool } from "./MemoryDeleteTool.js";

export { makeMemorySaveTool, makeMemorySearchTool, makeMemoryDeleteTool };

export function makeMemoryTools(memory: MemorySystem, sessionId: string): ToolDefinition[] {
  return [
    makeMemorySaveTool(memory, sessionId),
    makeMemorySearchTool(memory),
    makeMemoryDeleteTool(memory),
  ];
}
