/**
 * Scrubs known secret patterns from strings before logging/telemetry.
 *
 * Patterns are ordered most-specific first. `g` flags are required: these
 * regexes are reused across calls, so a stateful lastIndex would otherwise
 * make redaction intermittent.
 */
type Replacement = string | ((match: string) => string);

const SECRET_PATTERNS: Array<[RegExp, Replacement]> = [
  // Private key blocks (multiline) — must run before single-line patterns.
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g, "[PRIVATE_KEY]"],
  // Provider keys. Modern Anthropic keys are sk-ant-api03-… (contains '-').
  [/sk-ant-[A-Za-z0-9_\-]{16,}/g, "[ANTHROPIC_KEY]"],
  [/sk-proj-[A-Za-z0-9_\-]{16,}/g, "[OPENAI_KEY]"],
  [/sk-or-v1-[A-Za-z0-9]{16,}/g, "[OPENROUTER_KEY]"],
  [/sk-[A-Za-z0-9]{20,}/g, "[API_KEY]"],
  // Other well-known token formats.
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, "[GITHUB_TOKEN]"],
  [/github_pat_[A-Za-z0-9_]{20,}/g, "[GITHUB_TOKEN]"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/g, "[SLACK_TOKEN]"],
  [/AIza[A-Za-z0-9_\-]{30,}/g, "[GOOGLE_KEY]"],
  [/AKIA[A-Z0-9]{16}/g, "[AWS_KEY]"],
  [/eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, "[JWT]"],
  // Bearer tokens and generic key=value assignments.
  [/Bearer\s+[A-Za-z0-9\-_.]{16,}/gi, "Bearer [TOKEN]"],
  [/(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|credential)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi, "[SECRET]"],
  // AWS secret access keys are 40 base64-ish chars and are not AKIA-prefixed.
  [/(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g, "[AWS_SECRET]"],
  // Normalize home directories (privacy, not credentials).
  [/\/Users\/[^/\s]+/g, "/Users/[USER]"],
  [/\/home\/[^/\s]+/g, "/home/[USER]"],
];

export function scrubSecrets(input: string): string {
  let result = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (typeof replacement === "string") {
      result = result.replace(pattern, replacement);
    } else {
      result = result.replace(pattern, (match) => replacement(match));
    }
  }
  return result;
}

/**
 * Build a "safe" metadata object for logging by scrubbing all string values,
 * including values inside arrays and keys that themselves look sensitive.
 */
export function safeMetadata(obj: unknown): unknown {
  if (typeof obj === "string") return scrubSecrets(obj);
  if (Array.isArray(obj)) return obj.map((item) => safeMetadata(item));
  if (obj && typeof obj === "object") {
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = /^(?:password|passwd|secret|token|api[_-]?key|authorization|credential)/i.test(k)
        ? `[${k.toUpperCase()}_REDACTED]`
        : k;
      safe[key] = /^(?:password|passwd|secret|token|api[_-]?key|authorization|credential)/i.test(k)
        ? "[REDACTED]"
        : safeMetadata(v);
    }
    return safe;
  }
  return obj;
}
