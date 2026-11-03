/**
 * Standalone Hermes MCP server starter.
 * Usage: bun run packages/hermes/src/start.ts
 */
import { PermissionLevel, resolveSettings, DEFAULT_TOOLS, makeMemoryTools, MemorySystem } from "@cowork/core";
import { HermesServer } from "./server/HermesServer.js";

const cwd = process.cwd();
const settings = await resolveSettings(cwd, process.env);

const transport = (process.env.COWORK_HERMES_TRANSPORT ?? "stdio") as "stdio" | "sse";
const port = parseInt(process.env.COWORK_HERMES_PORT ?? "3100", 10);
const toolAllowlist = (process.env.COWORK_HERMES_TOOL_ALLOWLIST ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const memory = new MemorySystem({ projectRoot: cwd });
await memory.store.init();
const sessionId = `hermes-${Date.now()}`;
const tools = [...DEFAULT_TOOLS, ...makeMemoryTools(memory, sessionId)];

const server = new HermesServer(
  {
    transport,
    port,
    authToken: process.env.COWORK_HERMES_AUTH_TOKEN,
    toolAllowlist,
    serverName: "locoworker-hermes",
    // A standalone MCP server has no interactive approver: read-only by default.
    permissionLevel: PermissionLevel.READ_ONLY,
    settings,
    workingDirectory: cwd,
    // No interactive approver is attached to a standalone MCP server.
    requestApproval: async () => false,
  },
  tools,
);

if (transport === "stdio") {
  await server.startStdio();
} else {
  server.startSse();
  process.stderr.write(`[hermes] Exposed tools: ${server.exposedTools().join(", ") || "(none)"}\n`);
  await new Promise(() => {});
}
