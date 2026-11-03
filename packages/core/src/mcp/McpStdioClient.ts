// packages/core/src/mcp/McpStdioClient.ts

import { spawn, type ChildProcess } from "node:child_process";
import {
  mergeResourceLimits,
  resolveAllowedCommand,
} from "@cowork/security/utils";
import { buildMcpEnv } from "./mcpEnv.js";
import type { McpServerConfig, McpToolSchema, McpClient } from "./types.js";

/**
 * Trusted, operator-level MCP stdio limits (R-11).
 * The old client buffered stdout without a ceiling and had no request timeout,
 * so a silent or chatty server could grow `buffer` and `pending` forever.
 */
export interface McpClientLimits {
  maxLineBytes: number;
  maxPending: number;
  requestTimeoutMs: number;
}

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface McpClientStats {
  pending: number;
  bufferBytes: number;
  droppedLines: number;
}

/**
 * Trusted spawn policy supplied by the caller (never by the MCP config file).
 */
export interface McpSpawnPolicy {
  /** Operator-allowlisted executables; empty means "deny all". */
  allowedCommands?: readonly string[];
  /** Trusted, absolute working directory for the child. */
  cwd?: string;
  /** Parent environment to filter; defaults to process.env. */
  parentEnv?: NodeJS.ProcessEnv;
}

function unrefTimer(timer: unknown): void {
  (timer as { unref?: () => void } | undefined)?.unref?.();
}

/**
 * Minimal MCP stdio client.
 * Uses the MCP JSON-RPC protocol over stdin/stdout.
 * Handles initialize → tools/list → tools/call lifecycle.
 */
export class McpStdioClient implements McpClient {
  serverName: string;
  tools: McpToolSchema[] = [];

  private proc: ChildProcess | null = null;
  private pending = new Map<number, PendingRequest>();
  private readonly limits: McpClientLimits;
  private nextId = 1;
  private buffer = "";
  private droppedLines = 0;
  private procExited = false;

  constructor(
    private config: McpServerConfig,
    limits?: Partial<McpClientLimits>,
    private policy: McpSpawnPolicy = {},
  ) {
    this.serverName = config.name;
    const resolved = mergeResourceLimits();
    const override = limits ?? {};
    this.limits = {
      maxLineBytes: override.maxLineBytes ?? resolved.maxMcpLineBytes,
      maxPending: override.maxPending ?? resolved.maxMcpPending,
      requestTimeoutMs: override.requestTimeoutMs ?? resolved.mcpRequestTimeoutMs,
    };
  }

  /** Exposed for load/regression tests: in-flight count and buffered bytes. */
  stats(): McpClientStats {
    return {
      pending: this.pending.size,
      bufferBytes: this.buffer.length,
      droppedLines: this.droppedLines,
    };
  }

  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new Error(`McpStdioClient: "command" is required for transport=stdio`);
    }

    // R-13: an untrusted config may not choose an arbitrary executable,
    // inherit credentials, or set execution hooks via config.env.
    const resolved = await resolveAllowedCommand(
      this.config.command!,
      this.config.args ?? [],
      this.policy.allowedCommands ?? [],
      { label: `MCP server "${this.config.name}"` },
    );
    const built = buildMcpEnv(this.config.env, this.policy.parentEnv ?? process.env);
    if (built.rejected.length > 0) {
      process.stderr.write(
        `[mcp] ignored unsafe env from "${this.config.name}": ${built.rejected.join(", ")}\n`,
      );
    }

    this.procExited = false;
    this.proc = spawn(resolved.command, resolved.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: built.env,
      cwd: this.policy.cwd,
      shell: false,
    });

    this.proc.stdout!.on("data", (chunk: Buffer) => {
      this.pushChunk(chunk.toString());
    });

    this.proc.on("error", (err) => {
      this.failAll(err instanceof Error ? err : new Error(String(err)));
    });
    this.proc.on("exit", (code, signal) => {
      this.procExited = true;
      this.failAll(new Error(`MCP server exited (code=${code}, signal=${signal ?? "none"})`));
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
    // Do not wait for a shutdown reply from a process that is already gone.
    if (this.proc && !this.procExited) {
      try {
        await this.request("shutdown", {});
      } catch {
        // ignore shutdown errors
      }
    }
    this.failAll(new Error("MCP client disconnected"));
    this.proc?.kill();
    this.proc = null;
  }

  private pushChunk(chunk: string): void {
    // Refuse a partial line that never terminates, before it can grow.
    if (this.buffer.length + chunk.length > this.limits.maxLineBytes) {
      this.droppedLines += 1;
      this.buffer = "";
      this.failAll(new Error(`MCP stdio line exceeds ${this.limits.maxLineBytes} bytes`));
      return;
    }

    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    if (this.buffer.length > this.limits.maxLineBytes) {
      this.droppedLines += 1;
      this.buffer = "";
      this.failAll(new Error(`MCP stdio line exceeds ${this.limits.maxLineBytes} bytes`));
      return;
    }

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
            this.settle(msg.id, pending, msg.error ? new Error(msg.error.message) : null, msg.result);
          }
        }
      } catch {
        // malformed line — skip
      }
    }
  }

  private settle(
    id: number,
    pending: PendingRequest,
    error: Error | null,
    result?: unknown,
  ): void {
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (error) pending.reject(error);
    else pending.resolve(result);
  }

  private failAll(err: Error): void {
    for (const [id, pending] of [...this.pending]) {
      this.settle(id, pending, err);
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (this.pending.size >= this.limits.maxPending) {
      return Promise.reject(new Error(`Too many in-flight MCP requests (${this.limits.maxPending})`));
    }
    return new Promise<unknown>((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.settle(id, pending, new Error(`MCP request "${method}" timed out after ${this.limits.requestTimeoutMs}ms`));
      }, this.limits.requestTimeoutMs);
      unrefTimer(timer);
      this.pending.set(id, { resolve, reject, timer });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.proc?.stdin!.write(msg);
    });
  }
}
