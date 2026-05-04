import type { ToolDefinition, ToolContext } from "@cowork/core";
import { ProjectManager } from "./ProjectManager";

export const ProjectList: ToolDefinition = {
  name: "ProjectList",
  description:
    "List all registered cowork projects with their status, last-accessed time, and stats.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["active", "archived", "paused"],
        description: "Filter by status (default: all)",
      },
    },
    required: [],
  },
  permissionLevel: "READ_ONLY",
  async execute(input: { status?: string }, _ctx: ToolContext) {
    const manager = new ProjectManager();
    const projects = await manager.list(input.status as any);
    if (projects.length === 0) {
      return { content: "No projects registered.", isError: false };
    }
    const lines = projects.map((p) =>
      `- **${p.name}** [\`${p.status}\`] ${p.path}\n  Last: ${p.lastAccessedAt.slice(0, 10)} | ${p.provider ?? "default"} / ${p.model ?? "default"}`
    );
    return { content: `## Projects (${projects.length})\n\n${lines.join("\n\n")}`, isError: false };
  },
};

export const ProjectSwitch: ToolDefinition = {
  name: "ProjectSwitch",
  description:
    "Switch the active project by name, id, or path. " +
    "Updates the global active project record.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", description: "Project name, id, or path" },
    },
    required: ["project"],
  },
  permissionLevel: "STANDARD",
  async execute(input: { project: string }, _ctx: ToolContext) {
    const manager = new ProjectManager();
    const record = await manager.setActive(input.project);
    if (!record) {
      return { content: `Project "${input.project}" not found.`, isError: true };
    }
    return { content: `Switched to project: ${record.name} (${record.path})`, isError: false };
  },
};

export const ProjectRegister: ToolDefinition = {
  name: "ProjectRegister",
  description:
    "Register a new project path in the global project registry.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Project directory path" },
      name: { type: "string" },
      description: { type: "string" },
    },
    required: ["path"],
  },
  permissionLevel: "STANDARD",
  async execute(input: { path: string; name?: string; description?: string }, _ctx: ToolContext) {
    const manager = new ProjectManager();
    const record = await manager.register(input.path, {
      name: input.name,
      description: input.description,
    });
    return { content: `Project registered: ${record.name} (id: ${record.id})`, isError: false };
  },
};

export const PROJECT_TOOLS: ToolDefinition[] = [ProjectList, ProjectSwitch, ProjectRegister];
