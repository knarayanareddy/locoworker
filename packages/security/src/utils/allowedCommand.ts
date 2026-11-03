/**
 * Shared executable allowlisting for MCP stdio servers and template
 * `postInstall` steps (R-13).
 *
 * A config file (MCP config, marketplace index, template definition) is
 * untrusted data. Spawning whatever `command` it names is arbitrary code
 * execution. This helper resolves the binary to a real absolute path, refuses
 * shell strings, and requires the operator to have allowlisted that exact
 * binary (or its basename). Callers must still use `shell: false`.
 */
import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";

export class CommandNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandNotAllowedError";
  }
}

/** Characters that only make sense if a shell is going to interpret them. */
const SHELL_METACHARACTERS = /[;&|`$<>(){}[\]*?!~#\n\r"']/u;
const SHELL_NAMES = new Set([
  "sh", "bash", "dash", "zsh", "fish", "ksh", "csh", "tcsh",
  "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh",
]);

export interface ResolvedCommand {
  /** Absolute, symlink-resolved path to the executable. */
  command: string;
  args: string[];
  /** True when the resolved binary is a shell (callers should reject -c/-e). */
  isShell: boolean;
}

export function isShellCommand(command: string): boolean {
  const name = basename(command).toLowerCase();
  return SHELL_NAMES.has(name) || name.endsWith(".exe") && SHELL_NAMES.has(name.slice(0, -4));
}

export async function resolveAllowedCommand(
  command: string,
  args: readonly string[],
  allowlist: readonly string[],
  options: { envPath?: string; label?: string } = {},
): Promise<ResolvedCommand> {
  const label = options.label ?? "command";
  if (!command || command.length > 4_096 || SHELL_METACHARACTERS.test(command)) {
    throw new CommandNotAllowedError(`[security] ${label} is not a plain executable name`);
  }
  if (allowlist.length === 0) {
    throw new CommandNotAllowedError(
      `[security] ${label} "${command}" is not allowlisted (no allowed commands configured)`,
    );
  }

  let candidate: string | null = null;
  if (isAbsolute(command)) {
    candidate = command;
  } else {
    // A bare name is resolved through the *operator's* PATH, never through a
    // value supplied by an untrusted config file.
    const searchPath = options.envPath ?? process.env.PATH ?? "";
    for (const dir of searchPath.split(":").filter(Boolean)) {
      const probe = join(dir, command);
      const st = await stat(probe).catch(() => null);
      if (st?.isFile() && (st.mode & 0o111) !== 0) {
        candidate = probe;
        break;
      }
    }
  }
  if (!candidate) {
    throw new CommandNotAllowedError(`[security] ${label} "${command}" could not be resolved`);
  }

  const safeArgs: string[] = [];
  for (const arg of args) {
    if (typeof arg !== "string" || arg.includes("\0") || arg.includes("\n") || arg.includes("\r")) {
      throw new CommandNotAllowedError(`[security] ${label} has an invalid argument`);
    }
    safeArgs.push(arg);
  }

  const resolved = await realpath(candidate).catch(() => resolve(candidate));
  // Refuse shell command-string invocation unconditionally, before the
  // allowlist check: an argv array must never be turned back into a shell.
  if (
    isShellCommand(resolved) &&
    safeArgs.some((arg) => arg === "-c" || arg === "-e" || arg === "/C" || arg === "/c")
  ) {
    throw new CommandNotAllowedError(
      `[security] ${label} refuses shell -c/-e invocation; use an argv array`,
    );
  }

  const name = basename(resolved);
  const allowed = allowlist.some((entry) => {
    if (!entry) return false;
    if (entry.includes("/")) {
      return resolve(entry) === resolved || basename(entry) === name;
    }
    return entry === name || entry === command;
  });
  if (!allowed) {
    throw new CommandNotAllowedError(
      `[security] ${label} "${command}" (resolved ${resolved}) is not allowlisted`,
    );
  }

  return { command: resolved, args: safeArgs, isShell: isShellCommand(resolved) };
}
