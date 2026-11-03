import { describe, expect, test } from "bun:test";
import { HermesServer } from "../src/server/HermesServer.js";
import { PermissionLevel } from "@cowork/core";
import type { ToolDefinition } from "@cowork/core";

const tools: ToolDefinition[] = [
  {
    name: "Read", description: "read", permissionLevel: PermissionLevel.READ_ONLY,
    inputSchema: { type: "object", properties: {} },
    async execute() { return { content: "file contents", isError: false }; },
  },
  {
    name: "Bash", description: "shell", permissionLevel: PermissionLevel.STANDARD,
    requiresApproval: true,
    inputSchema: { type: "object", properties: {} },
    async execute() { return { content: "should not run", isError: false }; },
  },
];

const server = new HermesServer({
  transport: "stdio",
  toolAllowlist: ["read", "bash"],
  permissionLevel: PermissionLevel.READ_ONLY,
  requestApproval: async () => false,
  workingDirectory: "/tmp",
}, tools);

describe("HermesServer", () => {
  test("matches a lower-case allowlist against canonical tool names", () => {
    expect(server.exposedTools().sort()).toEqual(["Bash", "Read"]);
  });

  test("tools/call is gated by the session permission level", async () => {
    const reply = await server.dispatch({
      jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "Bash", arguments: {} },
    });
    expect(reply.result).toEqual({
      content: [{ type: "text", text: expect.stringContaining("requires") }],
      isError: true,
    });
  });

  test("read-only tools still execute through the gate", async () => {
    const reply = await server.dispatch({
      jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "Read", arguments: {} },
    });
    expect(reply.result).toEqual({
      content: [{ type: "text", text: "file contents" }],
      isError: false,
    });
  });

  test("an unset allowlist exposes only safe read-only tools", () => {
    const all = new HermesServer({ transport: "stdio", permissionLevel: PermissionLevel.READ_ONLY }, tools);
    expect(all.exposedTools()).toEqual(["Read"]); // Bash is not in the safe default
    const denied = new HermesServer({
      transport: "stdio", toolAllowlist: ["nonexistent"],
      permissionLevel: PermissionLevel.READ_ONLY,
    }, tools);
    expect(denied.exposedTools().length).toBe(1); // safe defaults still apply
  });
});
