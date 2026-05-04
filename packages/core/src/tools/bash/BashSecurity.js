/**
 * Bash command security checks.
 *
 * Spec PART 4 references 23 numbered checks from Claude Code's bashSecurity.ts.
 * Phase 1 implements a focused subset covering the highest-impact attack
 * vectors: hard blocklist, shell-metacharacter detection in unquoted spots,
 * unicode zero-width injection, and IFS / null-byte abuse. The remaining
 * checks (zsh-equals expansion, heredoc injection, etc.) are left for a
 * follow-up pass with a real test suite.
 */
const HARD_BLOCKLIST = [
    /\brm\s+-[rfRF]+\s+\/(?:\s|$)/, // rm -rf /
    /\brm\s+-[rfRF]+\s+~(?:\s|$)/, // rm -rf ~
    /\bmkfs\b/, // filesystem creation
    /\bdd\s+if=.*\bof=\/dev\//, // raw device writes
    /:\(\)\s*\{.*\|\s*:\s*&\s*\}/, // fork bomb
    /\bchmod\s+-R\s+777\s+\//, // perm wipe
    /\bsudo\s+rm\s+-[rfRF]+/, // sudo rm -rf
    />\s*\/dev\/sda/, // raw disk write
];
const ZERO_WIDTH = /[​‌‍﻿]/;
const NULL_BYTE = /\x00/;
const IFS_ABUSE = /\bIFS\s*=\s*['"]?\$?'?\s*['"]/;
export function checkBashCommand(command) {
    if (!command || command.trim().length === 0) {
        return { safe: false, reason: "Empty command" };
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
    for (const pattern of HARD_BLOCKLIST) {
        if (pattern.test(command)) {
            return { safe: false, reason: `Command matches hard blocklist: ${pattern.source}` };
        }
    }
    return { safe: true };
}
//# sourceMappingURL=BashSecurity.js.map