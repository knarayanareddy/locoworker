/**
 * R-13: confine template-generated paths to the target directory.
 *
 * `Scaffolder` used `path.join(targetDir, file.path)` with no check, so a
 * template containing `../../.ssh/authorized_keys` could write outside the
 * project. This guard rejects absolute paths, `../` escapes, symlinks in the
 * writable chain, and a small set of definitely-sensitive filenames. Unlike
 * the model-facing `guardPath` it *allows* `.cowork/settings.json` and
 * `.gitignore`, which built-in templates legitimately create.
 */
import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

export class ScaffoldPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaffoldPathError";
  }
}

const DENIED_SEGMENTS = new Set([
  ".git", ".ssh", ".aws", ".gnupg", ".kube", "secrets",
]);
const DENIED_BASENAME = /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|kdbx)|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|credentials|\.npmrc|\.netrc|\.gitconfig|\.htpasswd)$/iu;

export async function resolveScaffoldPath(root: string, requested: string): Promise<string> {
  if (!requested || requested.includes("\0")) {
    throw new ScaffoldPathError("empty or NUL-containing template path");
  }
  if (isAbsolute(requested)) {
    throw new ScaffoldPathError(`absolute template path refused: ${requested}`);
  }

  const base = resolve(root);
  const target = resolve(base, requested);
  const rel = relative(base, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new ScaffoldPathError(`template path escapes target directory: ${requested}`);
  }

  for (const segment of rel.split(sep).filter((p) => p !== "" && p !== ".")) {
    if (DENIED_SEGMENTS.has(segment) || DENIED_BASENAME.test(segment)) {
      throw new ScaffoldPathError(`template path targets a sensitive name: ${segment}`);
    }
  }

  // Refuse any symlink in the writable chain, including the final file.
  let cursor = target;
  for (;;) {
    const st = await lstat(cursor).catch(() => null);
    if (st?.isSymbolicLink()) {
      throw new ScaffoldPathError(`template path traverses a symlink: ${cursor}`);
    }
    if (cursor === base || dirname(cursor) === cursor) break;
    cursor = dirname(cursor);
  }

  const realBase = await realpath(base).catch(() => base);
  let existing = target;
  const suffix: string[] = [];
  for (;;) {
    const st = await lstat(existing).catch(() => null);
    if (st) break;
    if (existing === base || dirname(existing) === existing) break;
    suffix.unshift(basename(existing));
    existing = dirname(existing);
  }
  const realExisting = await realpath(existing).catch(() => existing);
  const realTarget = resolve(realExisting, ...suffix);
  const realRel = relative(realBase, realTarget);
  if (realRel.startsWith("..") || isAbsolute(realRel)) {
    throw new ScaffoldPathError(`template path escapes via a symlink: ${requested}`);
  }
  return realTarget;
}
