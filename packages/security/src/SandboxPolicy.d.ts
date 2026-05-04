/**
 * SandboxPolicy: enhanced Bash security beyond the basic Phase 1 blocklist.
 * Implements tiered checks:
 *   1. Hard blocklist (always deny)
 *   2. Soft blocklist (deny unless ELEVATED permission)
 *   3. Path containment (deny escaping projectRoot)
 *   4. Network access policy (optional allowlist)
 *   5. Entropy / obfuscation detection
 */
export type PolicyVerdict = "allow" | "deny" | "warn";
export interface PolicyResult {
    verdict: PolicyVerdict;
    reason?: string;
    severity: "low" | "medium" | "high" | "critical";
}
export interface SandboxPolicyConfig {
    projectRoot: string;
    permissionLevel: string;
    allowNetworkAccess?: boolean;
    networkAllowlist?: string[];
    allowedCwdPrefixes?: string[];
}
export declare class SandboxPolicy {
    private config;
    constructor(config: SandboxPolicyConfig);
    check(command: string): PolicyResult;
    private shannonEntropy;
}
//# sourceMappingURL=SandboxPolicy.d.ts.map