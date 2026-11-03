/**
 * Private state writers for transcripts, audit events, session state and
 * cost ledgers (under `~/.cowork` / `<project>/.cowork`).
 *
 * The previous implementation used `writeFile`/`appendFile` (which follow the
 * final symlink) and `chmod(path)` afterwards. A repository can ship
 * `.cowork/wiki/<slug>.json` as a symlink, so the next state save overwrote
 * the target and changed its mode. These helpers now:
 *   - refuse symlinks / non-regular files anywhere in the writable chain;
 *   - open with O_NOFOLLOW (atomic protection against a swapped final link)
 *     and O_NONBLOCK (so a planted FIFO cannot hang the process);
 *   - chmod through the open file descriptor, never through a re-resolved path.
 */
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";

export const PRIVATE_DIR_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const O_DIRECTORY = constants.O_DIRECTORY ?? 0;
const O_NONBLOCK = constants.O_NONBLOCK ?? 0;

type Chain = { boundary: string; below: string[] };

/** Path components that do not exist yet, walking up to the nearest existing one. */
async function chainFromBoundary(target: string): Promise<Chain> {
  const absolute = resolve(target);
  const below: string[] = [];
  let cursor = absolute;
  for (;;) {
    const st = await lstat(cursor).catch(() => null);
    if (st) return { boundary: cursor, below };
    below.unshift(cursor);
    const parent = dirname(cursor);
    if (parent === cursor) return { boundary: cursor, below };
    cursor = parent;
  }
}

/**
 * Symlinks in the top two path segments are OS-provided mount aliases
 * (e.g. `/tmp` on macOS); anything deeper is user/repository-controlled and
 * must not be trusted as a state root.
 */
function isOsLevelBoundary(path: string): boolean {
  return path.split(sep).filter(Boolean).length <= 2;
}

async function assertComponentIsNotAlias(candidate: string): Promise<void> {
  const st = await lstat(candidate).catch(() => null);
  if (!st) return;
  if (st.isSymbolicLink()) {
    throw new Error(`[security] refusing to write through a symlink: ${candidate}`);
  }
  const parent = dirname(candidate);
  if (parent === candidate) return;
  const ownReal = await realpath(candidate).catch(() => null);
  const parentReal = await realpath(parent).catch(() => null);
  if (ownReal && parentReal && resolve(ownReal) !== resolve(parentReal, basename(candidate))) {
    throw new Error(`[security] refusing to write through a redirected path: ${candidate}`);
  }
}

async function assertChain(chain: Chain): Promise<void> {
  const boundaryStat = await lstat(chain.boundary).catch(() => null);
  if (boundaryStat?.isSymbolicLink() && !isOsLevelBoundary(chain.boundary)) {
    throw new Error(`[security] refusing to write through a symlinked state root: ${chain.boundary}`);
  }
  for (const component of chain.below) await assertComponentIsNotAlias(component);
}

/** Reject a final target that is a symlink, directory, FIFO, socket or device. */
async function assertFileTarget(filePath: string): Promise<void> {
  const st = await lstat(filePath).catch(() => null);
  if (!st) return;
  if (st.isSymbolicLink()) {
    throw new Error(`[security] refusing to overwrite a symlinked state file: ${filePath}`);
  }
  if (!st.isFile()) {
    throw new Error(`[security] refusing to write a non-regular state file: ${filePath}`);
  }
}

/**
 * Validate a state root before any writes (used by project-local stores such
 * as WikiStore / GraphStorage, whose directories live inside a cloned repo).
 */
export async function assertSafeStatePath(target: string): Promise<void> {
  await assertChain(await chainFromBoundary(target));
  await assertFileTarget(target);
}

async function tightenDir(dir: string): Promise<void> {
  // chmod via an fd so a swapped path cannot be chmod'ed instead.
  let handle;
  try {
    handle = await open(dir, constants.O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
    await handle.chmod(PRIVATE_DIR_MODE);
  } catch {
    // O_DIRECTORY/O_NOFOLLOW are unavailable on some platforms: fall back to
    // a path chmod only after the chain has been verified.
    await chmod(dir, PRIVATE_DIR_MODE).catch(() => {});
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function ensurePrivateDir(dir: string): Promise<void> {
  // Snapshot before mkdir: recursive mkdir would otherwise follow a symlink
  // planted in the chain and create the directory at its target.
  const chain = await chainFromBoundary(dir);
  await assertChain(chain);
  await mkdir(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  await assertChain(chain); // re-verify after creation (TOCTOU)
  // Only tighten the requested directory. Newly created parents already have
  // 0700 from mkdir; chmod'ing an existing OS ancestor would be destructive.
  await tightenDir(dir);
}

export async function writePrivateFile(filePath: string, data: string): Promise<void> {
  await ensurePrivateDir(dirname(filePath));
  await assertSafeStatePath(filePath);
  const handle = await open(
    filePath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | O_NOFOLLOW | O_NONBLOCK,
    PRIVATE_FILE_MODE,
  );
  try {
    const st = await handle.stat();
    if (!st.isFile()) throw new Error(`[security] refusing to write a non-regular state file: ${filePath}`);
    await handle.writeFile(data, "utf8");
    await handle.chmod(PRIVATE_FILE_MODE);
  } finally {
    await handle.close();
  }
}

export async function appendPrivateFile(filePath: string, data: string): Promise<void> {
  await ensurePrivateDir(dirname(filePath));
  await assertSafeStatePath(filePath);
  const handle = await open(
    filePath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | O_NOFOLLOW | O_NONBLOCK,
    PRIVATE_FILE_MODE,
  );
  try {
    const st = await handle.stat();
    if (!st.isFile()) throw new Error(`[security] refusing to append to a non-regular state file: ${filePath}`);
    await handle.appendFile(data, "utf8");
    await handle.chmod(PRIVATE_FILE_MODE);
  } finally {
    await handle.close();
  }
}
