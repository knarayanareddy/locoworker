Phase 5 — Full Coherence Fix
The problem, precisely stated
There are four distinct gaps that together make the Phase 5 wiring incomplete:

packages/core/package.json exports map — only exposes ".", "./tools", "./providers". The CLI imports @cowork/core/hooks, @cowork/core/session, @cowork/core/skills, @cowork/core/mcp — none of which are declared.

packages/core/src/ is missing four module directories — hooks/, session/, skills/, mcp/ — and the source files inside them don't exist yet.

apps/cowork-cli/package.json declares workspace deps on packages that don't exist — @cowork/kairos, @cowork/wiki, @cowork/research, @cowork/orchestrator, @cowork/plugins.

queryLoop.ts has a finalText correctness bug — the "on-complete" hook (used by SessionManager to write session summaries) reads finalText, but finalText is reset to "" inside the tool loop, so session summaries are always wrong on tool-heavy runs.

The fix below is dependency-ordered: fix the type contracts first (smallest, innermost), then build out the missing modules, then wire the exports map, then fix the workspace deps, then fix the CLI session runtime.

Fix 1 — queryLoop.ts: accumulate finalText correctly
File: packages/core/src/queryLoop.ts

Find the tool loop that resets finalText and change it so text is accumulated, not reset:

TypeScript

// BEFORE (inside the tool processing loop — wrong):
for (const tu of toolUses) {
  finalText = "";          // ← BUG: nukes any text the model wrote before tools
  // ... execute tool ...
}

// AFTER: remove the reset entirely.
// finalText is declared once before the turn loop and only appended to:
let finalText = "";

// Inside the model response processing, keep existing appends:
for (const block of response.content) {
  if (block.type === "text") {
    finalText += block.text;   // ← accumulate across all turns
    yield { type: "text", text: block.text };
  }
  // ...
}
// DO NOT reset finalText anywhere inside the tool loop.
Why this matters: buildSessionRuntime registers an "on-complete" hook that writes summary: ctx.finalText.slice(0, 500) into the session record. If finalText is empty (reset), every session summary is blank.

Fix 2 — Create packages/core/src/hooks/
This is the smallest new module. Everything else (skills, session, mcp) depends on hooks being defined first.

packages/core/src/hooks/types.ts
TypeScript

import type { AgentEvent } from "../types.js";

export type HookName =
  | "pre-tool"
  | "post-tool"
  | "on-turn"
  | "on-complete"
  | "on-event"
  | "on-error";

export interface HookContext {
  sessionId: string;
  workingDirectory: string;
  turnIndex: number;
  finalText: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export type PreToolHookFn = (
  toolName: string,
  input: unknown,
  ctx: HookContext
) => Promise<void> | void;

export type PostToolHookFn = (
  toolName: string,
  input: unknown,
  result: { content: string; isError: boolean },
  ctx: HookContext
) => Promise<void> | void;

export type OnCompleteHookFn = (ctx: HookContext) => Promise<void> | void;
export type OnTurnHookFn = (ctx: HookContext) => Promise<void> | void;
export type OnEventHookFn = (event: AgentEvent, ctx: HookContext) => Promise<void> | void;
export type OnErrorHookFn = (error: Error, ctx: HookContext) => Promise<void> | void;

export type HookFn =
  | PreToolHookFn
  | PostToolHookFn
  | OnCompleteHookFn
  | OnTurnHookFn
  | OnEventHookFn
  | OnErrorHookFn;
packages/core/src/hooks/HookRegistry.ts
TypeScript

import type {
  HookName,
  HookFn,
  PreToolHookFn,
  PostToolHookFn,
  OnCompleteHookFn,
  OnTurnHookFn,
  OnEventHookFn,
  OnErrorHookFn,
  HookContext,
} from "./types.js";
import type { AgentEvent } from "../types.js";

export class HookRegistry {
  private hooks = new Map<HookName, HookFn[]>();

  register(name: HookName, fn: HookFn): void {
    const existing = this.hooks.get(name) ?? [];
    this.hooks.set(name, [...existing, fn]);
  }

  async runPreTool(toolName: string, input: unknown, ctx: HookContext): Promise<void> {
    const fns = (this.hooks.get("pre-tool") ?? []) as PreToolHookFn[];
    for (const fn of fns) await fn(toolName, input, ctx);
  }

  async runPostTool(
    toolName: string,
    input: unknown,
    result: { content: string; isError: boolean },
    ctx: HookContext
  ): Promise<void> {
    const fns = (this.hooks.get("post-tool") ?? []) as PostToolHookFn[];
    for (const fn of fns) await fn(toolName, input, result, ctx);
  }

  async runOnComplete(ctx: HookContext): Promise<void> {
    const fns = (this.hooks.get("on-complete") ?? []) as OnCompleteHookFn[];
    for (const fn of fns) await fn(ctx);
  }

  async runOnTurn(ctx: HookContext): Promise<void> {
    const fns = (this.hooks.get("on-turn") ?? []) as OnTurnHookFn[];
    for (const fn of fns) await fn(ctx);
  }

  async runOnEvent(event: AgentEvent, ctx: HookContext): Promise<void> {
    const fns = (this.hooks.get("on-event") ?? []) as OnEventHookFn[];
    for (const fn of fns) await fn(event, ctx);
  }

  async runOnError(error: Error, ctx: HookContext): Promise<void> {
    const fns = (this.hooks.get("on-error") ?? []) as OnErrorHookFn[];
    for (const fn of fns) await fn(error, ctx);
  }

  clear(name?: HookName): void {
    if (name) {
      this.hooks.delete(name);
    } else {
      this.hooks.clear();
    }
  }
}
packages/core/src/hooks/index.ts
TypeScript

export { HookRegistry } from "./HookRegistry.js";
export type {
  HookName,
  HookFn,
  HookContext,
  PreToolHookFn,
  PostToolHookFn,
  OnCompleteHookFn,
  OnTurnHookFn,
  OnEventHookFn,
  OnErrorHookFn,
} from "./types.js";
Fix 3 — Create packages/core/src/session/
The SessionManager is responsible for persisting named session records to disk under ~/.cowork/sessions/.

packages/core/src/session/types.ts
TypeScript

export type SessionStatus = "active" | "complete" | "error" | "interrupted";

export interface SessionRecord {
  id: string;
  name?: string;
  projectRoot: string;
  provider: string;
  model: string;
  permissionMode: string;
  status: SessionStatus;
  createdAt: string;       // ISO 8601
  updatedAt: string;
  completedAt?: string;
  summary?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  turns: number;
  transcriptPath?: string;
}

export interface CreateSessionOptions {
  id: string;
  name?: string;
  projectRoot: string;
  provider: string;
  model: string;
  permissionMode: string;
}

export interface UpdateSessionOptions {
  status?: SessionStatus;
  summary?: string;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  turns?: number;
  transcriptPath?: string;
}
packages/core/src/session/SessionManager.ts
TypeScript

import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type {
  SessionRecord,
  CreateSessionOptions,
  UpdateSessionOptions,
} from "./types.js";

export class SessionManager {
  private sessionsDir: string;

  constructor(projectRoot: string) {
    // Sessions are stored globally, not per-project, so you can
    // --resume by ID from any directory.
    this.sessionsDir = join(homedir(), ".cowork", "sessions");
  }

  async init(): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
  }

  private sessionPath(id: string): string {
    return join(this.sessionsDir, `${id}.json`);
  }

  async create(options: CreateSessionOptions): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: options.id,
      name: options.name,
      projectRoot: options.projectRoot,
      provider: options.provider,
      model: options.model,
      permissionMode: options.permissionMode,
      status: "active",
      createdAt: now,
      updatedAt: now,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      turns: 0,
    };
    await this.save(record);
    return record;
  }

  async update(id: string, options: UpdateSessionOptions): Promise<SessionRecord | null> {
    const record = await this.get(id);
    if (!record) return null;

    const updated: SessionRecord = {
      ...record,
      ...options,
      updatedAt: new Date().toISOString(),
    };

    if (options.status === "complete" || options.status === "error") {
      updated.completedAt = updated.updatedAt;
    }

    await this.save(updated);
    return updated;
  }

  async get(id: string): Promise<SessionRecord | null> {
    const path = this.sessionPath(id);
    if (!existsSync(path)) return null;
    try {
      const raw = await readFile(path, "utf-8");
      return JSON.parse(raw) as SessionRecord;
    } catch {
      return null;
    }
  }

  async list(limit = 20): Promise<SessionRecord[]> {
    try {
      const files = await readdir(this.sessionsDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json")).slice(-limit);
      const records = await Promise.all(
        jsonFiles.map(async (f) => {
          try {
            const raw = await readFile(join(this.sessionsDir, f), "utf-8");
            return JSON.parse(raw) as SessionRecord;
          } catch {
            return null;
          }
        })
      );
      return records
        .filter((r): r is SessionRecord => r !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  async findByName(name: string): Promise<SessionRecord | null> {
    const all = await this.list(200);
    return all.find((r) => r.name === name) ?? null;
  }

  private async save(record: SessionRecord): Promise<void> {
    await writeFile(
      this.sessionPath(record.id),
      JSON.stringify(record, null, 2),
      "utf-8"
    );
  }
}
packages/core/src/session/index.ts
TypeScript

export { SessionManager } from "./SessionManager.js";
export type {
  SessionRecord,
  SessionStatus,
  CreateSessionOptions,
  UpdateSessionOptions,
} from "./types.js";
Fix 4 — Create packages/core/src/skills/
Skills are named prompt snippets or small shell scripts that the agent can invoke via SkillTool. The SkillRegistry loads them from <project>/.cowork/skills/.

packages/core/src/skills/types.ts
TypeScript

export type SkillKind = "prompt" | "shell";

export interface Skill {
  name: string;
  description: string;
  kind: SkillKind;
  /** For kind=prompt: the prompt text to inject. */
  prompt?: string;
  /** For kind=shell: the shell command to run. */
  command?: string;
  /** Optional param names the caller should fill in before execution. */
  params?: string[];
}
packages/core/src/skills/SkillRegistry.ts
TypeScript

import { join, resolve } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Skill } from "./types.js";

export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private skillsDir: string;

  constructor(projectRoot: string) {
    this.skillsDir = join(resolve(projectRoot), ".cowork", "skills");
  }

  async load(): Promise<void> {
    if (!existsSync(this.skillsDir)) return;

    try {
      const files = await readdir(this.skillsDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      await Promise.all(
        jsonFiles.map(async (file) => {
          try {
            const raw = await readFile(join(this.skillsDir, file), "utf-8");
            const skill = JSON.parse(raw) as Skill;
            if (skill.name) {
              this.skills.set(skill.name, skill);
            }
          } catch {
            // skip malformed skill files
          }
        })
      );
    } catch {
      // skills dir unreadable — that's fine
    }
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }
}
packages/core/src/skills/SkillTool.ts
TypeScript

import { spawn } from "node:child_process";
import type { ToolDefinition, ToolContext } from "../tools/types.js";
import { PermissionLevel } from "../permissions/index.js";
import type { SkillRegistry } from "./SkillRegistry.js";

export function makeSkillTool(registry: SkillRegistry): ToolDefinition {
  return {
    name: "skill",
    description:
      "Execute a named skill from the project's .cowork/skills/ directory. " +
      "Use skill_list to discover available skills first.",
    permissionLevel: PermissionLevel.STANDARD,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the skill to execute.",
        },
        params: {
          type: "object",
          description: "Key/value parameters to interpolate into the skill.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["name"],
    },
    async execute(input: { name: string; params?: Record<string, string> }, _ctx: ToolContext) {
      const skill = registry.get(input.name);
      if (!skill) {
        return {
          content: `Skill "${input.name}" not found. Available: ${registry.list().map((s) => s.name).join(", ") || "none"}`,
          isError: true,
        };
      }

      if (skill.kind === "prompt") {
        // Interpolate params into the prompt text
        let text = skill.prompt ?? "";
        for (const [k, v] of Object.entries(input.params ?? {})) {
          text = text.replaceAll(`{{${k}}}`, v);
        }
        return { content: text, isError: false };
      }

      if (skill.kind === "shell") {
        let cmd = skill.command ?? "";
        for (const [k, v] of Object.entries(input.params ?? {})) {
          cmd = cmd.replaceAll(`{{${k}}}`, v);
        }
        return new Promise<{ content: string; isError: boolean }>((resolve) => {
          const proc = spawn("/bin/bash", ["-c", cmd], {
            timeout: 30_000,
            stdio: "pipe",
          });
          let stdout = "";
          let stderr = "";
          proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
          proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
          proc.on("close", (code) => {
            const output = [stdout, stderr].filter(Boolean).join("\n").slice(0, 8_000);
            resolve({ content: output || `Exit code ${code}`, isError: code !== 0 });
          });
          proc.on("error", (err) => {
            resolve({ content: err.message, isError: true });
          });
        });
      }

      return { content: `Unknown skill kind: ${skill.kind}`, isError: true };
    },
  };
}

export function makeSkillListTool(registry: SkillRegistry): ToolDefinition {
  return {
    name: "skill_list",
    description: "List all available skills in the project's .cowork/skills/ directory.",
    permissionLevel: PermissionLevel.READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    async execute(_input, _ctx) {
      const skills = registry.list();
      if (skills.length === 0) {
        return {
          content: "No skills found. Add JSON skill files to .cowork/skills/ to create skills.",
          isError: false,
        };
      }
      const lines = skills.map(
        (s) => `• ${s.name} [${s.kind}]: ${s.description}`
      );
      return { content: lines.join("\n"), isError: false };
    },
  };
}
packages/core/src/skills/index.ts
TypeScript

export { SkillRegistry } from "./SkillRegistry.js";
export { makeSkillTool, makeSkillListTool } from "./SkillTool.js";
export type { Skill, SkillKind } from "./types.js";
Fix 5 — Create packages/core/src/mcp/
MCP (Model Context Protocol) tools are external tool servers that the CLI can connect to via --mcp-config. buildMcpTools connects to each server, discovers its tools, and returns ToolDefinition wrappers for them.

packages/core/src/mcp/types.ts
TypeScript

export interface McpServerConfig {
  /** A human-readable name for this MCP server (used in tool name prefixing). */
  name: string;
  /** Transport: "stdio" spawns a process; "sse" connects to an HTTP SSE endpoint. */
  transport: "stdio" | "sse";
  /** For transport=stdio: the command to spawn. */
  command?: string;
  /** For transport=stdio: arguments to the command. */
  args?: string[];
  /** For transport=sse: the base URL of the SSE endpoint. */
  url?: string;
  /** Optional auth token sent as Bearer in the Authorization header (sse only). */
  authToken?: string;
  /** Optional env overrides for the spawned process (stdio only). */
  env?: Record<string, string>;
}

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpClient {
  serverName: string;
  tools: McpToolSchema[];
  call(toolName: string, input: unknown): Promise<{ content: string; isError: boolean }>;
  disconnect(): Promise<void>;
}
packages/core/src/mcp/McpStdioClient.ts
TypeScript

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
packages/core/src/mcp/buildMcpTools.ts
TypeScript

import { PermissionLevel } from "../permissions/index.js";
import type { ToolDefinition } from "../tools/types.js";
import type { McpClient, McpServerConfig } from "./types.js";
import { McpStdioClient } from "./McpStdioClient.js";

export async function buildMcpTools(
  configs: McpServerConfig[]
): Promise<{ tools: ToolDefinition[]; clients: McpClient[] }> {
  const clients: McpClient[] = [];
  const tools: ToolDefinition[] = [];

  for (const config of configs) {
    try {
      let client: McpClient;

      if (config.transport === "stdio") {
        const c = new McpStdioClient(config);
        await c.connect();
        client = c;
      } else {
        // SSE transport: defer to a future McpSseClient implementation.
        // For now, log and skip rather than hard-failing the whole boot.
        console.warn(
          `[mcp] SSE transport not yet implemented for server "${config.name}" — skipping.`
        );
        continue;
      }

      clients.push(client);

      for (const mcpTool of client.tools) {
        // Prefix tool name with server name to avoid collisions
        const qualifiedName = `${config.name}__${mcpTool.name}`;

        const toolDef: ToolDefinition = {
          name: qualifiedName,
          description: `[MCP:${config.name}] ${mcpTool.description ?? mcpTool.name}`,
          permissionLevel: PermissionLevel.STANDARD,
          requiresApproval: false,
          inputSchema: (mcpTool.inputSchema as Record<string, unknown>) ?? {
            type: "object",
            properties: {},
            required: [],
          },
          async execute(input, _ctx) {
            return client.call(mcpTool.name, input);
          },
        };

        tools.push(toolDef);
      }
    } catch (err) {
      console.warn(
        `[mcp] Failed to connect to server "${config.name}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      // Don't abort the whole boot — just skip this MCP server.
    }
  }

  return { tools, clients };
}
packages/core/src/mcp/index.ts
TypeScript

export { buildMcpTools } from "./buildMcpTools.js";
export { McpStdioClient } from "./McpStdioClient.js";
export type { McpServerConfig, McpToolSchema, McpClient } from "./types.js";
Fix 6 — Update packages/core/src/index.ts to export all four new modules
Replace / extend the existing packages/core/src/index.ts with these additional exports (keep everything that's already there):

TypeScript

// --- existing Phase 1-2 exports (keep as-is) ---
export * from "./types.js";
export * from "./queryLoop.js";
export * from "./permissions/index.js";
export * from "./providers/index.js";
export { QueryEngine } from "./services/QueryEngine.js";
export { ContextCompressor } from "./services/compact/ContextCompressor.js";
export * from "./state/Settings.js";
export * from "./state/SystemContext.js";
export * from "./memdir/MemorySystem.js";
export * from "./tools/index.js";
export * from "./commands/index.js";

// --- Phase 5 additions ---
export * from "./hooks/index.js";
export * from "./session/index.js";
export * from "./skills/index.js";
export * from "./mcp/index.js";
Fix 7 — Update packages/core/package.json exports map
Replace the existing exports block with one that covers all subpath imports the CLI uses:

JSON

{
  "name": "@cowork/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./tools": "./src/tools/index.ts",
    "./tools/graphify": "./src/tools/graphify/index.ts",
    "./providers": "./src/providers/index.ts",
    "./hooks": "./src/hooks/index.ts",
    "./session": "./src/session/index.ts",
    "./skills": "./src/skills/index.ts",
    "./mcp": "./src/mcp/index.ts"
  }
}
Note: Keep all existing fields (name, version, type, dependencies, devDependencies, scripts, tsconfig reference, etc.). Only replace/extend the exports block.

Fix 8 — Create stub packages for the missing workspace deps
The CLI's package.json declares workspace:* deps on @cowork/kairos, @cowork/wiki, @cowork/research, @cowork/orchestrator, and @cowork/plugins. Until Phase 3 content lands, these need to exist as minimal valid workspace packages so bun install doesn't fail.

Create the following files (identical pattern for each):

packages/kairos/package.json
JSON

{
  "name": "@cowork/kairos",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
packages/kairos/src/index.ts
TypeScript

// @cowork/kairos — Phase 3 daemon placeholder.
// Full implementation described in phase3remaining.md.
export {};
packages/kairos/tsconfig.json
JSON

{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": []
}
Repeat the same three-file pattern for:

packages/wiki/ (name: @cowork/wiki)
packages/research/ (name: @cowork/research)
packages/orchestrator/ (name: @cowork/orchestrator)
packages/plugins/ (name: @cowork/plugins)
Fix 9 — Update root tsconfig.json to include the new stub packages
JSON

{
  "files": [],
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/graphify" },
    { "path": "./packages/kairos" },
    { "path": "./packages/wiki" },
    { "path": "./packages/research" },
    { "path": "./packages/orchestrator" },
    { "path": "./packages/plugins" },
    { "path": "./apps/cowork-cli" }
  ]
}
Fix 10 — Wire hooks into queryLoop.ts (connecting the HookRegistry)
The queryLoop config object needs to accept and invoke hooks. Update the config type and the loop itself:

In queryLoop.ts — extend QueryLoopConfig
TypeScript

import type { HookRegistry } from "./hooks/index.js";

export interface QueryLoopConfig {
  engine: QueryEngine;
  systemPrompt: string;
  tools: ToolDefinition[];
  maxTokens?: number;
  maxTurns?: number;
  compressor?: ContextCompressor;
  requestApproval?: (toolName: string, input: unknown) => Promise<boolean>;
  hooks?: HookRegistry;   // ← add this
  sessionId?: string;     // ← add this (passed into HookContext)
  workingDirectory?: string; // ← add this
}
In queryLoop.ts — invoke hooks at the right lifecycle points
TypeScript

// Build hook context once per loop, update it as state changes:
const hookCtx = {
  sessionId: config.sessionId ?? "unknown",
  workingDirectory: config.workingDirectory ?? process.cwd(),
  turnIndex: 0,
  finalText,
  totalInputTokens,
  totalOutputTokens,
};

// At the START of each turn:
hookCtx.turnIndex = turnIndex;
hookCtx.finalText = finalText;
hookCtx.totalInputTokens = totalInputTokens;
hookCtx.totalOutputTokens = totalOutputTokens;
if (config.hooks) await config.hooks.runOnTurn(hookCtx);

// BEFORE each tool execution (after permission check passes):
if (config.hooks) await config.hooks.runPreTool(tu.name, tu.input, hookCtx);

// AFTER each tool execution:
if (config.hooks) await config.hooks.runPostTool(tu.name, tu.input, result, hookCtx);

// AT COMPLETION (before yielding the "complete" event):
hookCtx.finalText = finalText;
hookCtx.totalInputTokens = totalInputTokens;
hookCtx.totalOutputTokens = totalOutputTokens;
if (config.hooks) await config.hooks.runOnComplete(hookCtx);
Fix 11 — apps/cowork-cli/src/session.ts: pass hooks + sessionId + workingDirectory into queryLoop
The last gap is that session.ts builds hooks and sessionId but queryLoop may not be receiving them. Confirm the queryLoop call in apps/cowork-cli/src/index.ts passes:

TypeScript

for await (const event of queryLoop(prompt, {
  engine: runtime.engine,
  systemPrompt: runtime.systemPrompt,
  tools: runtime.tools,
  maxTokens: settings.maxTokens,
  maxTurns: settings.maxTurns,
  compressor: runtime.compressor,
  requestApproval: parsed.yes ? async () => true : undefined,
  hooks: runtime.hooks,                      // ← ensure this is wired
  sessionId: runtime.sessionId,              // ← ensure this is wired
  workingDirectory: settings.workingDirectory, // ← ensure this is wired
})) {
  // ...
}
Summary: the full change set
#	What	Where	Why
1	Fix finalText reset bug	packages/core/src/queryLoop.ts	Session summaries are wrong without this
2	Create hooks/ module	packages/core/src/hooks/	CLI imports @cowork/core/hooks
3	Create session/ module	packages/core/src/session/	CLI imports @cowork/core/session
4	Create skills/ module	packages/core/src/skills/	CLI imports @cowork/core/skills
5	Create mcp/ module	packages/core/src/mcp/	CLI imports @cowork/core/mcp
6	Update core/src/index.ts	packages/core/src/index.ts	Re-exports Phase 5 modules from "."
7	Update core/package.json exports	packages/core/package.json	Subpath imports need explicit exports entries
8	Create 5 stub packages	`packages/kairos	wiki
9	Update root tsconfig.json	tsconfig.json	tsc -b must include all workspace packages
10	Wire hooks into queryLoop	packages/core/src/queryLoop.ts	Hooks are declared but never invoked
11	Pass hooks/sessionId/cwd into loop	apps/cowork-cli/src/index.ts	Composition root must thread Phase 5 state into loop
