/**
 * Helpers for keeping credentials out of child processes and tool output.
 * Used by BashTool, EnvRead, and any other surface that sees process.env.
 */
const SENSITIVE_NAME = /^(?:.*(?:_API_KEY|_ACCESS_KEY|_SECRET|_TOKEN|_PASSWORD|_PASSWD|_CREDENTIALS?|_PRIVATE_KEY|_AUTH)|AWS_[A-Z_]+|GH_[A-Z_]+|GITHUB_[A-Z_]+|COWORK_.*(?:TOKEN|KEY|SECRET)|NPM_TOKEN|OPENAI_[A-Z_]+|ANTHROPIC_[A-Z_]+)$/i;

export function isSensitiveEnvName(name: string): boolean {
  return SENSITIVE_NAME.test(name);
}

export type FilterEnvOptions = {
  /** Keys that must be preserved even if they look sensitive. */
  allow?: readonly string[];
  /** Extra keys to strip. */
  deny?: readonly string[];
};

/**
 * Return a copy of `env` with credential-like variables removed.
 * Prefers a denylist over an allowlist so ordinary build tools keep working.
 */
export function filterEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: FilterEnvOptions = {},
): Record<string, string> {
  const allowed = new Set(options.allow ?? []);
  const denied = new Set(options.deny ?? []);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (denied.has(key)) continue;
    if (!allowed.has(key) && isSensitiveEnvName(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Render a single env var for display, redacting sensitive values. */
export function displayEnvValue(name: string, value: string | undefined): string {
  if (value === undefined) return `${name}=`;
  return isSensitiveEnvName(name) ? `${name}=[REDACTED]` : `${name}=${value}`;
}
