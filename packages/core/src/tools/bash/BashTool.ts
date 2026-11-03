import { spawn } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { type ToolDefinition, type ExecutionContext, type ToolResult, ok, err } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import { filterEnv } from "@cowork/security/env";
import { checkBashCommand } from "./BashSecurity.js";

type BashInput = {
  command: string;
  timeout?: number;
  cwd?: string;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

/** Resolve `cwd` inside the project root. Absolute paths outside it are rejected. */
export function resolveWorkingDirectory(root: string, requested?: string): string {
  if (!requested) return root;
  const candidate = resolve(root, requested);
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`cwd must stay inside the project root: ${requested}`);
  }
  return candidate;
}

export const BashTool: ToolDefinition<BashInput> = {
  name: "Bash",
  description:
    "Execute a shell command. Requires explicit user approval. Output is truncated at ~256KB. Long-running commands are killed at the timeout. Use for: running tests, git commands, build tools.",
  permissionLevel: PermissionLevel.STANDARD,
  // Shell execution is powerful: always ask, even when the session level is high.
  requiresApproval: true,
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to run" },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default 30000, max 600000)",
      },
      cwd: { type: "string", description: "Working directory (relative to project root)" },
    },
    required: ["command"],
    additionalProperties: false,
  },

  async execute(input: BashInput, ctx: ExecutionContext): Promise<ToolResult> {
    const security = checkBashCommand(input.command);
    if (security.safe === false) {
      return err(`Blocked by security check: ${security.reason}`);
    }

    const timeout = clamp(input.timeout ?? DEFAULT_TIMEOUT_MS, 1_000, 600_000);
    let cwd: string;
    try {
      cwd = resolveWorkingDirectory(ctx.workingDirectory, input.cwd);
    } catch (e) {
      return err(`Invalid cwd: ${(e as Error).message}`);
    }

    const mode = ctx.settings?.sandboxMode ?? "none";
    if (mode !== "none" && mode !== "docker" && mode !== "podman") {
      return err(`Unknown sandboxMode "${String(mode)}"; refusing to run unsandboxed`);
    }
    // Credentials never reach child processes.
    const env = filterEnv(process.env);

    return await new Promise<ToolResult>((resolvePromise) => {
      const isContainer = mode !== "none";
      const bin = isContainer ? mode : "/bin/bash";
      const args = isContainer
        ? [
            "run", "--rm",
            "--network", "none",
            "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges",
            "--pids-limit", "256",
            "--memory", "1g",
            "--read-only",
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=256m",
            "-v", `${cwd}:/workspace:rw`,
            "-w", "/workspace",
            "ubuntu:latest",
            "/bin/bash", "-c", input.command,
          ]
        : ["-c", input.command];

      const child = spawn(bin, args, {
        cwd: isContainer ? undefined : cwd,
        env: isContainer ? undefined : env,
        detached: true,
      });

      let stdout = "";
      let stderr = "";
      let truncated = false;
      let bytes = 0;
      let settled = false;

      const append = (chunk: Buffer, target: "stdout" | "stderr") => {
        if (truncated) return;
        bytes += chunk.length;
        if (bytes > MAX_OUTPUT_BYTES) {
          truncated = true;
          return;
        }
        if (target === "stdout") stdout += chunk.toString("utf8");
        else stderr += chunk.toString("utf8");
      };

      child.stdout.on("data", (c: Buffer) => append(c, "stdout"));
      child.stderr.on("data", (c: Buffer) => append(c, "stderr"));

      const killTree = () => {
        try {
          // Detached processes get their own process group: kill the whole tree.
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      };

      const timer = setTimeout(killTree, timeout);
      const onAbort = () => killTree();
      ctx.abortSignal?.addEventListener("abort", onAbort, { once: true });

      const finish = (result: ToolResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ctx.abortSignal?.removeEventListener("abort", onAbort);
        resolvePromise(result);
      };

      child.on("close", (code, signal) => {
        const parts: string[] = [];
        if (stdout) parts.push(`<stdout>\n${stdout}\n</stdout>`);
        if (stderr) parts.push(`<stderr>\n${stderr}\n</stderr>`);
        if (truncated) parts.push(`[output truncated at ${MAX_OUTPUT_BYTES} bytes]`);
        parts.push(`<exit>${signal ?? code ?? 0}</exit>`);
        const failed = (code ?? 0) !== 0 || signal !== null;
        finish({ content: parts.join("\n"), isError: failed });
      });

      child.on("error", (e) => {
        finish(err(`Failed to spawn bash: ${e.message}`));
      });
    });
  },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
