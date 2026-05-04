/**
 * Six permission levels — see spec PART 16.
 * Tools declare a required level; the gate compares with the active session level.
 */
export declare enum PermissionLevel {
    READ_ONLY = 0,
    CONSTRAINED = 1,
    STANDARD = 2,
    ELEVATED = 3,
    FULL = 4,
    DANGEROUS = 5
}
export type PermissionMode = "read-only" | "constrained" | "standard" | "elevated" | "full" | "dangerous";
export declare function modeToLevel(mode: PermissionMode): PermissionLevel;
export declare function levelName(level: PermissionLevel): string;
//# sourceMappingURL=PermissionLevel.d.ts.map