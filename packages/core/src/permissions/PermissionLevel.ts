/**
 * Six permission levels — see spec PART 16.
 * Tools declare a required level; the gate compares with the active session level.
 */
export enum PermissionLevel {
  READ_ONLY = 0,
  CONSTRAINED = 1,
  STANDARD = 2,
  ELEVATED = 3,
  FULL = 4,
  DANGEROUS = 5,
}

export type PermissionMode =
  | "read-only"
  | "constrained"
  | "standard"
  | "elevated"
  | "full"
  | "dangerous";

export function modeToLevel(mode: PermissionMode): PermissionLevel {
  switch (mode) {
    case "read-only": return PermissionLevel.READ_ONLY;
    case "constrained": return PermissionLevel.CONSTRAINED;
    case "standard": return PermissionLevel.STANDARD;
    case "elevated": return PermissionLevel.ELEVATED;
    case "full": return PermissionLevel.FULL;
    case "dangerous": return PermissionLevel.DANGEROUS;
  }
}

export function levelName(level: PermissionLevel): string {
  return PermissionLevel[level] ?? `LEVEL_${level}`;
}
