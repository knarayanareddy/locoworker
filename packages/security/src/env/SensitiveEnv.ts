/**
 * Helpers for keeping credentials out of child processes and tool output.
 * Used by BashTool, EnvRead, and any other surface that sees process.env.
 */
const SENSITIVE_NAME = /^(?:.*(?:_API_KEY|_ACCESS_KEY|_SECRET|_TOKEN|_PASSWORD|_PASSWD|_CREDENTIALS?|_PRIVATE_KEY|_AUTH)|AWS_[A-Z_]+|GH_[A-Z_]+|GITHUB_[A-Z_]+|COWORK_.*(?:TOKEN|KEY|SECRET)|NPM_TOKEN|OPENAI_[A-Z_]+|ANTHROPIC_[A-Z_]+)$/i;

export function isSensitiveEnvName(name: string): boolean {
  return SENSITIVE_NAME.test(name);
}

/**
 * Environment variables a child process may receive. Everything else —
 * including NODE_OPTIONS, LD_PRELOAD, BUN_OPTIONS, DATABASE_URL, SSH_AUTH_SOCK
 * and arbitrary *_KEY/*_TOKEN values — is dropped. An allowlist is safer than
 * a denylist because new execution-hooks appear faster than blocklists do.
 */
export const SAFE_ENV_KEYS: readonly string[] = [
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "LC_CTYPE",
  "TERM", "TMPDIR", "TZ", "PWD", "OLDPWD", "EDITOR", "VISUAL", "NODE_ENV",
  "CI", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR",
];

export type FilterEnvOptions = {
  /** Extra non-sensitive keys to keep in allowlist mode. */
  allow?: readonly string[];
  /** Extra keys to strip. */
  deny?: readonly string[];
  /** "allowlist" (default, for child processes) or "denylist" (display only). */
  mode?: "allowlist" | "denylist";
};

/**
 * Return a copy of `env` safe to hand to a child process. Defaults to a strict
 * allowlist; `mode: "denylist"` is only for read-only display surfaces.
 */
export function filterEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: FilterEnvOptions = {},
): Record<string, string> {
  const allowed = new Set<string>([...SAFE_ENV_KEYS, ...(options.allow ?? [])]);
  const denied = new Set(options.deny ?? []);
  const mode = options.mode ?? "allowlist";
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (denied.has(key)) continue;
    // Credentials are never forwarded, not even through an explicit allow.
    if (isSensitiveEnvName(key)) continue;
    if (mode === "allowlist" && !allowed.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Render a single env var for display, redacting sensitive values. */
export function displayEnvValue(name: string, value: string | undefined): string {
  if (value === undefined) return `${name}=`;
  return isSensitiveEnvName(name) ? `${name}=[REDACTED]` : `${name}=${value}`;
}
