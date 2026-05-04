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
export type SecurityResult = {
    safe: true;
} | {
    safe: false;
    reason: string;
};
export declare function checkBashCommand(command: string): SecurityResult;
//# sourceMappingURL=BashSecurity.d.ts.map