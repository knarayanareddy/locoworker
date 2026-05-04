// packages/core/src/mcp/McpClient.ts
// MCP client: connects to an MCP server (stdio or HTTP), lists tools,
// and proxies tool calls back through the Locoworker tool system.

import { spawn, type ChildProcess } from "node:child_process";
import type { McpServerConfig } from "./McpServerConfig.js";

// ── MCP protocol types (minimal subset needed for tool use) ─────────────────

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface McpRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

// ── McpClient ──────────────────────────────────────────────────────────────

export class McpClient {
  private readonly config: McpServerConfig;
  private nextId = 1;

  // stdio transport state
  private proc?: ChildProcess;
  private readBuffer = "";
  private pendingRequests = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  // http transport state
  private httpBaseUrl?: string;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.config.transport === "stdio") {
      await this.connectStdio();
    } else {
      this.httpBaseUrl = this.config.url!.replace(/\/$/, "");
    }
    // MCP handshake: initialize
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "locoworker", version: "0.1.0" },
    });
  }

  async disconnect(): Promise<void> {
    if (this.proc) {
      this.proc.kill();
      this.proc = undefined;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async listTools(): Promise<McpToolSchema[]> {
    const result = (await this.send("tools/list", {})) as {
      tools?: McpToolSchema[];
    };
    return result.tools ?? [];
  }

  async callTool(name: string, input: unknown): Promise<McpCallResult> {
    const result = (await this.send("tools/call", {
      name,
      arguments: input,
    })) as McpCallResult;
    return result;
  }

  // ── Transport: stdio ───────────────────────────────────────────────────────

  private async connectStdio(): Promise<void> {
    const { command, args = [], env = {} } = this.config;
    if (!command) throw new Error(`MCP server "${this.config.name}": stdio requires a command`);

    this.proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, ...env },
    });

    const stdout = this.proc.stdout;
    if (!stdout) throw new Error(`MCP server "${this.config.name}": could not attach stdout`);

    stdout.on("data", (chunk: Buffer) => {
      this.readBuffer += chunk.toString("utf8");
      this.drainBuffer();
    });

    this.proc.on("error", (err) => {
      for (const { reject } of this.pendingRequests.values()) {
        reject(new Error(`MCP stdio process error: ${err.message}`));
      }
      this.pendingRequests.clear();
    });

    this.proc.on("exit", (code) => {
      for (const { reject } of this.pendingRequests.values()) {
        reject(new Error(`MCP stdio process exited with code ${code}`));
      }
      this.pendingRequests.clear();
    });
  }

  private drainBuffer(): void {
    let newlineIdx: number;
    while ((newlineIdx = this.readBuffer.indexOf("\n")) !== -1) {
      const line = this.readBuffer.slice(0, newlineIdx).trim();
      this.readBuffer = this.readBuffer.slice(newlineIdx + 1);
      if (!line) continue;
      let msg: McpResponse;
      try {
        msg = JSON.parse(line) as McpResponse;
      } catch {
        continue;
      }
      const pending = this.pendingRequests.get(msg.id);
      if (!pending) continue;
      this.pendingRequests.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
      } else {
        pending.resolve(msg.result);
      }
    }
  }

  // ── Transport: HTTP ────────────────────────────────────────────────────────

  private async sendHttp(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const body: McpRequest = { jsonrpc: "2.0", id, method, params };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    const resp = await fetch(`${this.httpBaseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(`MCP HTTP ${resp.status}: ${await resp.text()}`);
    }
    const msg = (await resp.json()) as McpResponse;
    if (msg.error) {
      throw new Error(`MCP error ${msg.error.code}: ${msg.error.message}`);
    }
    return msg.result;
  }

  // ── Unified send ──────────────────────────────────────────────────────────

  private send(method: string, params: unknown): Promise<unknown> {
    if (this.config.transport === "http") {
      return this.sendHttp(method, params);
    }
    return this.sendStdio(method, params);
  }

  private sendStdio(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const req: McpRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const line = JSON.stringify(req) + "\n";
      if (!this.proc?.stdin) {
        reject(new Error("MCP stdio process not started"));
        return;
      }
      this.proc.stdin.write(line, (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }
}
