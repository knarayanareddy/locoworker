// packages/core/src/mcp/McpStdioClient.ts

import { spawn, type ChildProcess } from "node:child_process";
import type { McpServerConfig, McpToolSchema, McpClient } from "./types.js";

/**
 * Minimal MCP stdio client.
 * Uses the MCP JSON-RPC protocol over stdin/stdout.
 * Handles initialize → tools/list → tools/call lifecycle.
 */
export class McpStdioClient implements McpClient {
  serverName: string;
  tools: McpToolSchema[] = [];

  private proc: ChildProcess | null = null;
  private pending = new Map<number, {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
  }>();
  private nextId = 1;
  private buffer = "";

  constructor(private config: McpServerConfig) {
    this.serverName = config.name;
  }

  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new Error(`McpStdioClient: "command" is required for transport=stdio`);
    }

    this.proc = spawn(this.config.command, this.config.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.config.env },
    });

    this.proc.stdout!.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.drainBuffer();
    });

    this.proc.on("error", (err) => {
      for (const { reject } of this.pending.values()) reject(err);
      this.pending.clear();
    });

    // MCP initialize handshake
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "locoworker", version: "1.0.0" },
    });

    // Discover tools
    const result = (await this.request("tools/list", {})) as { tools: McpToolSchema[] };
    this.tools = result.tools ?? [];
  }

  async call(toolName: string, input: unknown): Promise<{ content: string; isError: boolean }> {
    try {
      const result = (await this.request("tools/call", {
        name: toolName,
        arguments: input,
      })) as { content?: Array<{ type: string; text?: string }>; isError?: boolean };

      const text = (result.content ?? [])
        .map((c) => (c.type === "text" ? (c.text ?? "") : JSON.stringify(c)))
        .join("\n");

      return { content: text, isError: result.isError ?? false };
    } catch (err) {
      return {
        content: err instanceof Error ? err.message : String(err),
        isError: true,
      };
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.request("shutdown", {});
    } catch {
      // ignore shutdown errors
    }
    this.proc?.kill();
    this.proc = null;
  }

  private drainBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as {
          id?: number;
          result?: unknown;
          error?: { message: string };
        };
        if (msg.id !== undefined) {
          const pending = this.pending.get(msg.id);
          if (pending) {
            this.pending.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(msg.error.message));
            } else {
              pending.resolve(msg.result);
            }
          }
        }
      } catch {
        // malformed line — skip
      }
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.proc?.stdin!.write(msg);
    });
  }
}
