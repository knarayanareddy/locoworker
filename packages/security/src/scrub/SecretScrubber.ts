/**
 * Scrubs known secret patterns from strings before logging/telemetry.
 * Based on the design doc's "safeMetadata" concept.
 */

const SECRET_PATTERNS: Array<[RegExp, string | ((s: string) => string)]> = [
  // API keys
  [/sk-[a-zA-Z0-9]{20,}/g,                      "[ANTHROPIC_KEY]"],
  [/sk-proj-[a-zA-Z0-9\-_]{20,}/g,              "[OPENAI_KEY]"],
  [/sk-or-v1-[a-zA-Z0-9]{20,}/g,                "[OPENROUTER_KEY]"],
  // Bearer tokens
  [/Bearer\s+[a-zA-Z0-9\-_.]{16,}/gi,           "Bearer [TOKEN]"],
  // Generic secrets
  [/(?:password|passwd|secret|token|key)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi, "[SECRET]"],
  // AWS keys
  [/AKIA[A-Z0-9]{16}/g,                          "[AWS_KEY]"],
  [/[a-zA-Z0-9/+]{40}(?![a-zA-Z0-9/+])/g,       (s) => s.startsWith("AKIA") ? "[AWS_SECRET]" : s],
  // Private keys
  [/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g, "[PRIVATE_KEY]"],
  // File paths with usernames (normalize home dirs)
  [/\/Users\/[^/\s]+/g,                          "/Users/[USER]"],
  [/\/home\/[^/\s]+/g,                           "/home/[USER]"],
];

export function scrubSecrets(input: string): string {
  let result = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    if (typeof replacement === "string") {
      result = result.replace(pattern, replacement);
    } else {
      result = result.replace(pattern, (match) => replacement(match));
    }
  }
  return result;
}

/**
 * Build a "safe" metadata object for logging by scrubbing all string values.
 * Aligns with the design doc's `safeMetadata` branding.
 */
export function safeMetadata(obj: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      safe[k] = scrubSecrets(v);
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      safe[k] = safeMetadata(v as Record<string, unknown>);
    } else {
      safe[k] = v;
    }
  }
  return safe;
}
