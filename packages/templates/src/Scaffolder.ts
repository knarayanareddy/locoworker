import type {
  Template,
  ScaffoldOptions,
  ScaffoldResult,
  PostInstallCommand,
  PostInstallOutcome,
} from "./types";
import { lstat, mkdir, open } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { filterEnv } from "@cowork/security/env";
import {
  mergeResourceLimits,
  mergeSupplyChainPolicy,
  resolveAllowedCommand,
} from "@cowork/security/utils";
import { resolveScaffoldPath } from "./scaffoldPath.js";

/** Shell metacharacters are meaningless with shell:false and are refused. */
const SHELL_METACHARACTERS = /[;&|`$<>(){}[\]*?!~#\n\r"']/u;
const MAX_POSTINSTALL_OUTPUT_BYTES = 64 * 1024;

function toArgv(command: PostInstallCommand): { command: string; args: string[] } | null {
  if (typeof command !== "string") {
    return { command: command.command, args: command.args ?? [] };
  }
  if (SHELL_METACHARACTERS.test(command)) return null;
  const parts = command.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return null;
  return { command: parts[0]!, args: parts.slice(1) };
}

function describe(command: PostInstallCommand): string {
  return typeof command === "string" ? command : `${command.command} ${(command.args ?? []).join(" ")}`;
}

export class Scaffolder {
  async scaffold(template: Template, opts: ScaffoldOptions): Promise<ScaffoldResult> {
    const startMs = Date.now();
    const filesCreated: string[] = [];
    const filesSkipped: string[] = [];
    const postInstall: PostInstallOutcome = { ran: [], skipped: [], failed: [] };

    const env = opts.env ?? process.env;
    const limits = mergeResourceLimits(opts.limits, env);
    const policy = mergeSupplyChainPolicy(undefined, env);
    const allowedCommands = opts.allowedPostInstallCommands ?? policy.templateAllowedCommands;
    const allowPostInstall = opts.allowPostInstall ?? policy.templateAllowPostInstall;
    const targetDir = resolve(opts.targetDir);

    // R-13: hard caps on template size and file count.
    const files = template.files;
    if (files.length > limits.maxTemplateFiles) {
      throw new Error(`template has ${files.length} files (cap ${limits.maxTemplateFiles})`);
    }
    let totalBytes = 0;
    for (const file of files) {
      const bytes = Buffer.byteLength(file.content, "utf8");
      if (bytes > limits.maxTemplateFileBytes) {
        throw new Error(`template file "${file.path}" is ${bytes} bytes (cap ${limits.maxTemplateFileBytes})`);
      }
      totalBytes += bytes;
      if (totalBytes > limits.maxTemplateTotalBytes) {
        throw new Error(`template exceeds the ${limits.maxTemplateTotalBytes}-byte total cap`);
      }
    }

    await mkdir(targetDir, { recursive: true });

    for (const file of files) {
      const filePath = this.substitute(file.path, opts.variables ?? {});
      const content = this.substitute(file.content, opts.variables ?? {});
      // Reject ../, absolute paths, symlinks and sensitive filenames.
      const absPath = await resolveScaffoldPath(targetDir, filePath);

      if (!opts.overwrite) {
        const existing = await lstat(absPath).catch(() => null);
        if (existing) {
          filesSkipped.push(filePath);
          continue;
        }
      }

      if (opts.dryRun) {
        filesCreated.push(filePath);
        continue;
      }

      await mkdir(dirname(absPath), { recursive: true });
      // O_NOFOLLOW: if the final path was swapped for a symlink between the
      // guard and the write, refuse it instead of overwriting the target.
      const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC |
        (constants.O_NOFOLLOW ?? 0);
      const handle = await open(absPath, flags, 0o644);
      try {
        await handle.writeFile(content, "utf8");
        if (file.executable) await handle.chmod(0o755);
      } finally {
        await handle.close();
      }
      filesCreated.push(filePath);
    }

    // ── postInstall: off by default, argv-only, allowlisted, bounded ─────────
    const commands = template.postInstall ?? [];
    for (const raw of commands) {
      const label = describe(raw);
      if (opts.dryRun || !allowPostInstall) {
        postInstall.skipped.push(`${label} (postInstall is opt-in)`);
        continue;
      }
      const parsed = toArgv(raw);
      if (!parsed) {
        postInstall.skipped.push(`${label} (shell metacharacters refused)`);
        continue;
      }
      if (opts.approvePostInstall && !(await opts.approvePostInstall(label))) {
        postInstall.skipped.push(`${label} (not approved)`);
        continue;
      }
      let resolvedCommand;
      try {
        resolvedCommand = await resolveAllowedCommand(
          parsed.command,
          parsed.args,
          allowedCommands,
          { label: "template postInstall", envPath: env.PATH },
        );
      } catch (err) {
        postInstall.skipped.push(`${label} (${err instanceof Error ? err.message : String(err)})`);
        continue;
      }
      const result = await this.runCommand(
        resolvedCommand.command,
        resolvedCommand.args,
        targetDir,
        filterEnv(env),
        limits.templatePostInstallTimeoutMs,
      );
      if (result.ok) postInstall.ran.push(label);
      else postInstall.failed.push(`${label} (${result.reason ?? "failed"})`);
    }

    if (postInstall.skipped.length > 0 || postInstall.failed.length > 0) {
      process.stderr.write(
        `[templates] postInstall: ${postInstall.ran.length} ran, ` +
        `${postInstall.skipped.length} skipped, ${postInstall.failed.length} failed\n`,
      );
    }

    return {
      filesCreated,
      filesSkipped,
      durationMs: Date.now() - startMs,
      postInstall,
    };
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd: string,
    env: Record<string, string>,
    timeoutMs: number,
  ): Promise<{ ok: boolean; reason?: string }> {
    return new Promise((settle) => {
      const child = spawn(command, args, {
        cwd,
        env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: timeoutMs,
      });
      let bytes = 0;
      let done = false;
      const finish = (ok: boolean, reason?: string): void => {
        if (done) return;
        done = true;
        settle({ ok, reason });
      };
      const onOutput = (chunk: Buffer): void => {
        bytes += chunk.length;
        if (bytes > MAX_POSTINSTALL_OUTPUT_BYTES) {
          child.kill("SIGKILL");
          finish(false, "output cap exceeded");
        }
      };
      child.stdout?.on("data", onOutput);
      child.stderr?.on("data", onOutput);
      child.on("error", (err) => finish(false, err.message));
      child.on("close", (code) => {
        if (code === 0) finish(true);
        else finish(false, `exit code ${code ?? "unknown"}`);
      });
    });
  }

  private substitute(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{{${key}}}`
    );
  }
}
