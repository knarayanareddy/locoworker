import { appendFile, chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Conversation transcripts, audit events, session state and API-cost ledgers
 * are written under `~/.cowork` / `<project>/.cowork`. With the default umask
 * these were created 0644 (and their directories 0755), so any local user
 * could read credentials pasted into a prompt or another tenant's history.
 */
export const PRIVATE_DIR_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

export async function ensurePrivateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  // mkdir's mode only applies to newly created directories; tighten existing
  // ones too (best effort — some filesystems do not support chmod).
  await chmod(dir, PRIVATE_DIR_MODE).catch(() => {});
}

export async function writePrivateFile(filePath: string, data: string): Promise<void> {
  await ensurePrivateDir(dirname(filePath));
  await writeFile(filePath, data, { encoding: "utf8", mode: PRIVATE_FILE_MODE });
  await chmod(filePath, PRIVATE_FILE_MODE).catch(() => {});
}

export async function appendPrivateFile(filePath: string, data: string): Promise<void> {
  await ensurePrivateDir(dirname(filePath));
  await appendFile(filePath, data, { encoding: "utf8", mode: PRIVATE_FILE_MODE });
  await chmod(filePath, PRIVATE_FILE_MODE).catch(() => {});
}
