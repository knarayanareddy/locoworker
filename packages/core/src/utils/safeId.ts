/**
 * IDs that are used as filesystem path components must be a single safe
 * segment. Several stores built paths as `join(dir, `${id}.json`)` with no
 * validation, so `--resume ../../etc/x` or a model-supplied memory id could
 * read/overwrite/unlink files outside the state directory.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

const SEPARATORS = /[\\/]/;

export function isSafeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    SAFE_ID.test(value) &&
    !SEPARATORS.test(value) &&
    !value.includes("..") &&
    !value.startsWith(".") &&
    !value.includes("\0")
  );
}

export function assertSafeId(value: unknown, label = "id"): string {
  if (!isSafeId(value)) {
    throw new Error(
      `Invalid ${label}: expected 1-128 characters of letters, digits, "_", "-" or "." with no path separators`,
    );
  }
  return value;
}
