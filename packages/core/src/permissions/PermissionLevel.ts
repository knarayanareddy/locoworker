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

export const PERMISSION_MODES: readonly PermissionMode[] = [
  "read-only", "constrained", "standard", "elevated", "full", "dangerous",
];

/** Case-insensitive parse that throws on unknown values (fail closed). */
export function parsePermissionMode(value: unknown): PermissionMode {
  if (typeof value !== "string") {
    throw new Error(`Invalid permission mode: expected a string, got ${typeof value}`);
  }
  const normalized = value.trim().toLowerCase().replace(/_/g, "-") as PermissionMode;
  if (!PERMISSION_MODES.includes(normalized)) {
    throw new Error(
      `Invalid permission mode "${value}". Expected one of: ${PERMISSION_MODES.join(", ")}`,
    );
  }
  return normalized;
}

export function modeToLevel(mode: PermissionMode): PermissionLevel {
  switch (parsePermissionMode(mode)) {
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
