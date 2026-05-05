/**
 * Standalone Hermes MCP server starter.
 * Usage: bun run packages/hermes/src/start.ts
 */
import { HermesServer } from "./server/HermesServer.js";
import {
  resolveProvider,
  QueryEngine,
  resolveSettings,
  DEFAULT_TOOLS,
} from "@cowork/core";
import { makeMemoryTools, MemorySystem } from "@cowork/core";

const cwd = process.cwd();
const settings = resolveSettings(cwd, process.env, {});

const transport = (process.env["COWORK_HERMES_TRANSPORT"] ?? "stdio") as "stdio" | "sse";
const port = parseInt(process.env["COWORK_HERMES_PORT"] ?? "3100", 10);
const authToken = process.env["COWORK_HERMES_AUTH_TOKEN"];
const toolAllowlist = (process.env["COWORK_HERMES_TOOL_ALLOWLIST"] ?? "")
  .split(",")
  .filter(Boolean);

const memory = new MemorySystem({ projectRoot: cwd });
await memory.store.init();
const sessionId = `hermes-${Date.now()}`;

const tools = [
  ...DEFAULT_TOOLS,
  ...makeMemoryTools(memory, sessionId),
];

const server = new HermesServer(
  { transport, port, authToken, toolAllowlist },
  tools
);

process.stderr.write(
  `[hermes] Starting MCP server (transport: ${transport}${transport === "sse" ? `, port: ${port}` : ""})\n`
);

if (transport === "stdio") {
  await server.startStdio();
} else {
  server.startSse();
  // Keep alive
  await new Promise(() => {});
}
