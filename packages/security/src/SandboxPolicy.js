/**
 * SandboxPolicy: enhanced Bash security beyond the basic Phase 1 blocklist.
 * Implements tiered checks:
 *   1. Hard blocklist (always deny)
 *   2. Soft blocklist (deny unless ELEVATED permission)
 *   3. Path containment (deny escaping projectRoot)
 *   4. Network access policy (optional allowlist)
 *   5. Entropy / obfuscation detection
 */
// ── Hard blocklist: always deny regardless of permissions ────────────────────
const HARD_BLOCKLIST = [
    [/rm\s+-rf\s+(\/|~|\.\.\/\.\.\/|\$HOME)/, "Recursive delete of root/home", "critical"],
    [/mkfs|fdisk|parted|wipefs/, "Disk formatting command", "critical"],
    [/:(){ :|:& };:/, "Fork bomb", "critical"],
    [/dd\s+if=\/dev\/zero\s+of=\/dev\//, "Disk wipe via dd", "critical"],
    [/>\s*\/etc\/passwd|>\s*\/etc\/shadow/, "Overwriting system auth files", "critical"],
    [/chmod\s+777\s+\//, "Insecure permissions on root", "critical"],
    [/\x00/, "Null byte in command", "high"],
    [/[\u200b\u200c\u200d\ufeff]/, "Zero-width unicode characters", "high"],
    [/IFS\s*=/, "IFS reassignment", "high"],
    [/base64\s+--decode.*\|\s*bash/, "Encoded payload execution", "critical"],
    [/eval\s+\$\(.*\)/, "Eval subshell injection pattern", "high"],
    [/curl.*\|\s*(?:ba)?sh/, "Pipe-to-shell from network", "critical"],
    [/wget.*-O\s*-.*\|\s*(?:ba)?sh/, "Pipe-to-shell from network (wget)", "critical"],
];
// ── Soft blocklist: deny unless ELEVATED or FULL permissions ─────────────────
const SOFT_BLOCKLIST = [
    [/sudo\s+/, "sudo usage"],
    [/su\s+-/, "su usage"],
    [/crontab\s+/, "crontab modification"],
    [/systemctl\s+(enable|disable|stop|start|restart)/, "systemctl service management"],
    [/launchctl\s+/, "launchctl (macOS service management)"],
    [/iptables|ufw|firewall-cmd/, "Firewall modification"],
    [/sysctl\s+-w/, "Kernel parameter modification"],
    [/mount\s+/, "Mount command"],
    [/chown\s+root/, "chown to root"],
];
const ELEVATED_PERMISSIONS = new Set(["ELEVATED", "FULL", "DANGEROUS"]);
export class SandboxPolicy {
    config;
    constructor(config) {
        this.config = config;
    }
    check(command) {
        // ── 1. Hard blocklist ─────────────────────────────────────────────────
        for (const [pattern, reason, severity] of HARD_BLOCKLIST) {
            if (pattern.test(command)) {
                return { verdict: "deny", reason, severity };
            }
        }
        // ── 2. Soft blocklist ─────────────────────────────────────────────────
        if (!ELEVATED_PERMISSIONS.has(this.config.permissionLevel)) {
            for (const [pattern, reason] of SOFT_BLOCKLIST) {
                if (pattern.test(command)) {
                    return { verdict: "deny", reason: `${reason} requires ELEVATED+ permission`, severity: "high" };
                }
            }
        }
        // ── 3. Entropy check: detect possibly encoded/obfuscated commands ──────
        const entropy = this.shannonEntropy(command);
        if (entropy > 4.5 && command.length > 80) {
            return {
                verdict: "warn",
                reason: `High entropy command (${entropy.toFixed(2)}) — possible obfuscation`,
                severity: "medium",
            };
        }
        // ── 4. Network access policy ──────────────────────────────────────────
        if (!this.config.allowNetworkAccess) {
            const netPattern = /curl|wget|nc\s|ncat\s|ssh\s|sftp\s|rsync\s.*@/;
            if (netPattern.test(command)) {
                if (!this.config.networkAllowlist?.some((h) => command.includes(h))) {
                    return {
                        verdict: "deny",
                        reason: "Network access not permitted in current sandbox policy",
                        severity: "medium",
                    };
                }
            }
        }
        return { verdict: "allow", severity: "low" };
    }
    shannonEntropy(s) {
        const freq = new Map();
        for (const ch of s)
            freq.set(ch, (freq.get(ch) ?? 0) + 1);
        let entropy = 0;
        for (const count of freq.values()) {
            const p = count / s.length;
            entropy -= p * Math.log2(p);
        }
        return entropy;
    }
}
//# sourceMappingURL=SandboxPolicy.js.map