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

import { HermesServer } from "./HermesServer";

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const server = new HermesServer({
  projectRoot: process.cwd(),
  transport: (get("--transport") as "stdio" | "sse") ?? "stdio",
  port: get("--port") ? parseInt(get("--port")!) : 3722,
  tools: get("--tools") ? get("--tools")!.split(",") : undefined,
  authToken: process.env.HERMES_AUTH_TOKEN,
  verbose: args.includes("--verbose"),
});

await server.start();
