/**
 * Six permission levels — see spec PART 16.
 * Tools declare a required level; the gate compares with the active session level.
 */
export var PermissionLevel;
(function (PermissionLevel) {
    PermissionLevel[PermissionLevel["READ_ONLY"] = 0] = "READ_ONLY";
    PermissionLevel[PermissionLevel["CONSTRAINED"] = 1] = "CONSTRAINED";
    PermissionLevel[PermissionLevel["STANDARD"] = 2] = "STANDARD";
    PermissionLevel[PermissionLevel["ELEVATED"] = 3] = "ELEVATED";
    PermissionLevel[PermissionLevel["FULL"] = 4] = "FULL";
    PermissionLevel[PermissionLevel["DANGEROUS"] = 5] = "DANGEROUS";
})(PermissionLevel || (PermissionLevel = {}));
export function modeToLevel(mode) {
    switch (mode) {
        case "read-only": return PermissionLevel.READ_ONLY;
        case "constrained": return PermissionLevel.CONSTRAINED;
        case "standard": return PermissionLevel.STANDARD;
        case "elevated": return PermissionLevel.ELEVATED;
        case "full": return PermissionLevel.FULL;
        case "dangerous": return PermissionLevel.DANGEROUS;
    }
}
export function levelName(level) {
    return PermissionLevel[level] ?? `LEVEL_${level}`;
}
//# sourceMappingURL=PermissionLevel.js.map