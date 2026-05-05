// packages/core/src/session/SessionManager.ts

import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getCoworkHome } from "../state/Settings.js";
import type {
  SessionRecord,
  CreateSessionOptions,
  UpdateSessionOptions,
} from "./types.js";

export class SessionManager {
  private sessionsDir: string;

  constructor(projectRoot: string) {
    // Sessions are stored globally, not per-project, so you can
    // --resume by ID from any directory.
    this.sessionsDir = join(getCoworkHome(), "sessions");
  }

  async init(): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
  }

  private sessionPath(id: string): string {
    return join(this.sessionsDir, `${id}.json`);
  }

  async create(options: CreateSessionOptions): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: options.id,
      name: options.name,
      projectRoot: options.projectRoot,
      provider: options.provider,
      model: options.model,
      permissionMode: options.permissionMode,
      status: "active",
      createdAt: now,
      updatedAt: now,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      turns: 0,
    };
    await this.save(record);
    return record;
  }

  async update(id: string, options: UpdateSessionOptions): Promise<SessionRecord | null> {
    const record = await this.get(id);
    if (!record) return null;

    const updated: SessionRecord = {
      ...record,
      ...options,
      updatedAt: new Date().toISOString(),
    };

    if (options.status === "complete" || options.status === "error") {
      updated.completedAt = updated.updatedAt;
    }

    await this.save(updated);
    return updated;
  }

  async get(id: string): Promise<SessionRecord | null> {
    const path = this.sessionPath(id);
    if (!existsSync(path)) return null;
    try {
      const raw = await readFile(path, "utf-8");
      return JSON.parse(raw) as SessionRecord;
    } catch {
      return null;
    }
  }

  async list(limit = 20): Promise<SessionRecord[]> {
    try {
      const files = await readdir(this.sessionsDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json")).slice(-limit);
      const records = await Promise.all(
        jsonFiles.map(async (f) => {
          try {
            const raw = await readFile(join(this.sessionsDir, f), "utf-8");
            return JSON.parse(raw) as SessionRecord;
          } catch {
            return null;
          }
        })
      );
      return records
        .filter((r): r is SessionRecord => r !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  async findByName(name: string): Promise<SessionRecord | null> {
    const all = await this.list(200);
    return all.find((r) => r.name === name) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const path = this.sessionPath(id);
    if (!existsSync(path)) return false;
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(path);
      return true;
    } catch {
      return false;
    }
  }

  private async save(record: SessionRecord): Promise<void> {
    await writeFile(
      this.sessionPath(record.id),
      JSON.stringify(record, null, 2),
      "utf-8"
    );
  }
}
