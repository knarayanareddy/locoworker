// packages/core/src/session/SessionManager.ts
// Persists and retrieves named sessions under ~/.cowork/projects/<project>/sessions/

import { readFile, writeFile, readdir, mkdir, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { SessionRecord, SessionStatus } from "./SessionRecord.js";

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 64);
}

export class SessionManager {
  private readonly sessionsDir: string;

  constructor(projectRoot: string) {
    const key = sanitize(basename(resolve(projectRoot)));
    this.sessionsDir = join(homedir(), ".cowork", "projects", key, "sessions");
  }

  async init(): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
  }

  /** Create and persist a new session record. */
  async create(
    id: string,
    opts: Pick<SessionRecord, "name" | "projectRoot" | "provider" | "model">
  ): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id,
      name: opts.name,
      projectRoot: opts.projectRoot,
      provider: opts.provider,
      model: opts.model,
      createdAt: now,
      updatedAt: now,
      status: "active",
      totalInputTokens: 0,
      totalOutputTokens: 0,
      turns: 0,
    };
    await this.save(record);
    return record;
  }

  async get(id: string): Promise<SessionRecord | null> {
    try {
      const raw = await readFile(this.filePath(id), "utf8");
      return JSON.parse(raw) as SessionRecord;
    } catch {
      return null;
    }
  }

  async save(record: SessionRecord): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
    await writeFile(this.filePath(record.id), JSON.stringify(record, null, 2), "utf8");
  }

  async update(
    id: string,
    patch: Partial<Omit<SessionRecord, "id" | "createdAt">>
  ): Promise<SessionRecord | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const updated: SessionRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.save(updated);
    return updated;
  }

  async list(status?: SessionStatus): Promise<SessionRecord[]> {
    let files: string[];
    try {
      files = await readdir(this.sessionsDir);
    } catch {
      return [];
    }
    const records: SessionRecord[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(this.sessionsDir, f), "utf8");
        const r = JSON.parse(raw) as SessionRecord;
        if (!status || r.status === status) records.push(r);
      } catch {
        continue;
      }
    }
    return records.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async delete(id: string): Promise<boolean> {
    try {
      await unlink(this.filePath(id));
      return true;
    } catch {
      return false;
    }
  }

  private filePath(id: string): string {
    return join(this.sessionsDir, `${sanitize(id)}.json`);
  }
}
