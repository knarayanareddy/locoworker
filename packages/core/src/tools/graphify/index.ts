import type { ToolDefinition } from "../../Tool.js";
import { makeGraphifyBuildTool } from "./GraphifyBuildTool.js";
import { makeGraphifyQueryTool } from "./GraphifyQueryTool.js";
import { GraphifySession } from "./GraphifySession.js";

export { GraphifySession, makeGraphifyBuildTool, makeGraphifyQueryTool };

export function makeGraphifyTools(session: GraphifySession): ToolDefinition[] {
  return [makeGraphifyBuildTool(session), makeGraphifyQueryTool(session)];
}
