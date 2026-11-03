/**
 * Bash command security checks.
 *
 * This is a *defence in depth* layer, not a sandbox: `BashTool` also requires
 * explicit user approval and can run commands inside a container. The checks
 * below cover the highest-impact destructive patterns and injection tricks;
 * they are intentionally conservative about what is allowed.
 */
export type SecurityResult = { safe: true } | { safe: false; reason: string };

const HARD_BLOCKLIST: Array<[RegExp, string]> = [
  [/\brm\s+-(?:[a-zA-Z]*[rRfF][a-zA-Z]*)\s+(?:\/|~|\$HOME|\/\*)(?:\s|$|\/)/, "recursive delete of root/home"],
  [/\brm\s+-(?:[a-zA-Z]*[rRfF][a-zA-Z]*)\s+[^\s]*\/\.\./, "recursive delete outside cwd"],
  [/\bsudo\s+/, "privilege escalation"],
  [/\bmkfs(?:\.|\s|$)/, "filesystem creation"],
  [/\bdd\s+if=.*\bof=\/dev\//, "raw device writes"],
  [/:\(\)\s*\{.*\|\s*:\s*&\s*\}/, "fork bomb"],
  [/\bchmod\s+-R\s+777\s+\//, "permission wipe"],
  [/>\s*\/dev\/(?:sda|nvme|disk)/, "raw disk write"],
  [/\b(?:sh|bash|zsh)\s+-c\s+.*\bcurl\b.*\|\s*(?:sh|bash)/, "piped remote script"],
  [/\bcurl\b[^\n]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/, "piped remote script"],
  [/\bwget\b[^\n]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/, "piped remote script"],
  [/\bbase64\s+(?:-d|--decode)\b[^\n]*\|\s*(?:sh|bash|zsh)\b/, "encoded script piped to shell"],
  [/\b(?:git|npm|yarn|pnpm|bun)\s+config\s+.*(?:credential|token|auth)/, "credential helper tampering"],
  [/\b(?:chown|chmod)\s+-R\s+(?:\/|~|$HOME)/, "recursive root permission change"],
  [/\b(?:mv|cp|ln)\s+[^\n]*\/(?:etc|root|boot)\//, "system file modification"],
  [/>\s*~(?:[/ ]|$)|\b(?:cat|tee)\b[^\n]*>\s*~\//, "write to home directory"],
  [/\b(?:history\s+-c|unset\s+HISTFILE)\b/, "history wiping"],
  [/\b(?:shutdown|reboot|halt|init\s+0)\b/, "host shutdown"],
  [/\b(?:crontab|systemctl|launchctl)\s+/, "persistent host configuration"],
];

const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/;
const NULL_BYTE = /\x00/;
const IFS_ABUSE = /\bIFS\s*=/;
const BACKTICK_SUBSTITUTION = /`[^`]*`/;

export function checkBashCommand(command: string): SecurityResult {
  if (!command || command.trim().length === 0) {
    return { safe: false, reason: "Empty command" };
  }
  if (command.length > 20_000) {
    return { safe: false, reason: "Command exceeds maximum length" };
  }
  if (NULL_BYTE.test(command)) {
    return { safe: false, reason: "Null byte injection detected" };
  }
  if (ZERO_WIDTH.test(command)) {
    return { safe: false, reason: "Unicode zero-width character detected" };
  }
  if (IFS_ABUSE.test(command)) {
    return { safe: false, reason: "IFS reassignment is not permitted" };
  }
  for (const [pattern, reason] of HARD_BLOCKLIST) {
    pattern.lastIndex = 0;
    if (pattern.test(command)) {
      return { safe: false, reason: `Blocked: ${reason}` };
    }
  }
  return { safe: true };
}

/** Exported for tests / callers that want to know why a command is risky. */
export const BASH_BLOCKLIST = HARD_BLOCKLIST;
export const hasCommandSubstitution = (command: string): boolean => BACKTICK_SUBSTITUTION.test(command);
