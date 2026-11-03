#!/usr/bin/env bun
/**
 * hermes — start a Hermes MCP server
 *
 * Usage:
 *   hermes                        (stdio, all tools)
 *   hermes --transport sse        (SSE on port 3722)
 *   hermes --port 4000            (SSE on custom port)
 *   hermes --tools Read,Write     (expose specific tools)
 */
import { DEFAULT_TOOLS, PermissionLevel } from "@cowork/core";
import { HermesServer } from "./index.js";

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const transport = (get("--transport") as "stdio" | "sse") ?? "stdio";
const server = new HermesServer(
  {
    transport,
    port: get("--port") ? parseInt(get("--port")!, 10) : 3722,
    toolAllowlist: get("--tools") ? get("--tools")!.split(",") : undefined,
    authToken: process.env.COWORK_HERMES_AUTH_TOKEN,
    // A standalone server has no interactive user to approve tool calls.
    permissionLevel: PermissionLevel.READ_ONLY,
    requestApproval: async () => false,
    workingDirectory: process.cwd(),
  },
  [...DEFAULT_TOOLS],
);

if (transport === "stdio") await server.startStdio();
else {
  server.startSse();
  await new Promise(() => {});
}
