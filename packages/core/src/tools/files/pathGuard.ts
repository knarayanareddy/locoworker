/**
 * Resolve a model-supplied path so it cannot leave the project root.
 *
 * Checks both the lexical path (`../`) and the *real* path after resolving
 * symlinks on the nearest existing ancestor. The latter matters for a repo
 * that contains a symlink pointing at ~/.ssh, /etc, or a parent directory.
 */
import { realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

/** Files and directories a model-supplied path must never resolve to. */
const SENSITIVE_BASENAME = /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|kdbx)|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|credentials|\.npmrc|\.netrc|\.gitconfig|\.htpasswd)$/i;
const SENSITIVE_DIRECTORIES = new Set([
  ".git", ".ssh", ".aws", ".gnupg", ".cowork", "secrets", ".kube",
]);

function assertNotSensitive(requested: string, target: string, base: string): void {
  const rel = relative(base, target);
  if (rel.startsWith("..") || isAbsolute(rel)) return; // handle escape separately
  const segments = rel.split(sep).filter((p) => p !== "" && p !== ".");
  for (const segment of segments) {
    if (SENSITIVE_DIRECTORIES.has(segment) || SENSITIVE_BASENAME.test(segment)) {
      throw new PathEscapeError(
        `Path "${requested}" points at sensitive file or directory "${segment}"`,
      );
    }
  }
}

export class PathEscapeError extends Error {}

export async function resolveInside(root: string, requested: string): Promise<string> {
  const base = resolve(root);
  const target = resolve(base, requested);
  const rel = relative(base, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new PathEscapeError(`Path "${requested}" escapes the project root`);
  }
  assertNotSensitive(requested, target, base);

  const realBase = await realpath(base).catch(() => base);
  let existing = target;
  const suffix: string[] = [];
  for (;;) {
    try {
      await stat(existing);
      break;
    } catch {
      if (existing === base || existing === dirname(existing)) break;
      suffix.unshift(basename(existing));
      existing = dirname(existing);
    }
  }
  const realExisting = await realpath(existing).catch(() => existing);
  const realTarget = resolve(realExisting, ...suffix);
  const realRel = relative(realBase, realTarget);
  if (realRel.startsWith("..") || isAbsolute(realRel)) {
    throw new PathEscapeError(`Path "${requested}" resolves outside the project root via a symlink`);
  }
  return realTarget;
}

/** Tool-friendly wrapper: returns an error string or a safe absolute path. */
export async function guardPath(
  root: string,
  requested: string,
): Promise<{ path: string; error?: undefined } | { path?: undefined; error: string }> {
  try {
    return { path: await resolveInside(root, requested) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
