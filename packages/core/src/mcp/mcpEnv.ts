/**
 * R-13: build a *bounded* environment for an MCP stdio server.
 *
 * Previously `spawn()` used `{ ...process.env, ...config.env }`, so an MCP
 * config file in a cloned repository could see every credential in the parent
 * process and set execution hooks such as NODE_OPTIONS or LD_PRELOAD.
 */
import { filterEnv, isSensitiveEnvName } from "@cowork/security/env";

/** Never forwarded from an untrusted config, even if it looks harmless. */
const MCP_DENIED_ENV_KEYS = new Set([
  "PATH", "HOME", "SHELL", "USER", "LOGNAME", "PWD", "OLDPWD",
  "NODE_OPTIONS", "NODE_PATH", "BUN_OPTIONS", "BUN_INSTALL",
  "LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH",
  "IFS", "ENV", "BASH_ENV", "CDPATH", "GLOBIGNORE",
  "PYTHONPATH", "PERL5LIB", "RUBYLIB",
  "SSH_AUTH_SOCK", "DATABASE_URL", "PGPASSWORD", "GIT_ASKPASS",
]);

const VALID_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_VALUE_CHARS = 4_096;

export interface McpEnvResult {
  env: Record<string, string>;
  rejected: string[];
}

export function buildMcpEnv(
  configEnv: Record<string, string> | undefined,
  baseEnv: NodeJS.ProcessEnv = process.env,
): McpEnvResult {
  // Start from the strict allowlist of the parent environment — credentials
  // never reach child processes.
  const env = filterEnv(baseEnv);
  const rejected: string[] = [];

  for (const [key, value] of Object.entries(configEnv ?? {})) {
    const upper = key.toUpperCase();
    const unsafe =
      !VALID_KEY.test(key) ||
      MCP_DENIED_ENV_KEYS.has(upper) ||
      isSensitiveEnvName(key) ||
      typeof value !== "string" ||
      value.length > MAX_VALUE_CHARS ||
      /[\0\r\n]/u.test(value);
    if (unsafe) {
      rejected.push(key);
      continue;
    }
    env[key] = value;
  }

  return { env, rejected };
}
