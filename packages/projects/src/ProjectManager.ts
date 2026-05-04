import { MemorySystem } from "@cowork/core";
import path from "path";
import mkdir from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import type { ProjectRecord, ProjectRegistry, ProjectStatus } from "./types";

const REGISTRY_FILE = path.join(homedir(), ".cowork", "projects-registry.json");

export class ProjectManager {
  // ── Registry operations ────────────────────────────────────────────────────

  async register(
    projectPath: string,
    opts?: Partial<Pick<ProjectRecord, "name" | "description" | "provider" | "model" | "tags">>
  ): Promise<ProjectRecord> {
    const registry = await this.loadRegistry();
    const absPath = path.resolve(projectPath);

    // Check if already registered
    const existing = registry.projects.find((p) => p.path === absPath);
    if (existing) {
      existing.lastAccessedAt = new Date().toISOString();
      await this.saveRegistry(registry);
      return existing;
    }

    const record: ProjectRecord = {
      id: randomUUID(),
      name: opts?.name ?? path.basename(absPath),
      path: absPath,
      status: "active",
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      provider: opts?.provider,
      model: opts?.model,
      tags: opts?.tags ?? [],
      description: opts?.description,
    };

    registry.projects.push(record);
    registry.activeProjectId = record.id;
    await this.saveRegistry(registry);
    return record;
  }

  async list(status?: ProjectStatus): Promise<ProjectRecord[]> {
    const registry = await this.loadRegistry();
    let projects = registry.projects;
    if (status) projects = projects.filter((p) => p.status === status);
    return projects.sort(
      (a, b) =>
        new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime()
    );
  }

  async get(idOrPath: string): Promise<ProjectRecord | null> {
    const registry = await this.loadRegistry();
    const absPath = path.resolve(idOrPath);
    return (
      registry.projects.find(
        (p) => p.id === idOrPath || p.path === absPath || p.name === idOrPath
      ) ?? null
    );
  }

  async setActive(idOrPath: string): Promise<ProjectRecord | null> {
    const registry = await this.loadRegistry();
    const project = registry.projects.find(
      (p) => p.id === idOrPath || p.path === path.resolve(idOrPath) || p.name === idOrPath
    );
    if (!project) return null;
    project.lastAccessedAt = new Date().toISOString();
    registry.activeProjectId = project.id;
    await this.saveRegistry(registry);
    return project;
  }

  async getActive(): Promise<ProjectRecord | null> {
    const registry = await this.loadRegistry();
    if (!registry.activeProjectId) return null;
    return registry.projects.find((p) => p.id === registry.activeProjectId) ?? null;
  }

  async archive(idOrPath: string): Promise<boolean> {
    return this.setStatus(idOrPath, "archived");
  }

  async restore(idOrPath: string): Promise<boolean> {
    return this.setStatus(idOrPath, "active");
  }

  async remove(idOrPath: string): Promise<boolean> {
    const registry = await this.loadRegistry();
    const absPath = path.resolve(idOrPath);
    const before = registry.projects.length;
    registry.projects = registry.projects.filter(
      (p) => p.id !== idOrPath && p.path !== absPath && p.name !== idOrPath
    );
    if (registry.projects.length === before) return false;
    await this.saveRegistry(registry);
    return true;
  }

  async stats(idOrPath: string): Promise<{
    project: ProjectRecord;
    memoryEntries: number;
    transcriptDays: number;
    wikiPages: number;
  } | null> {
    const project = await this.get(idOrPath);
    if (!project) return null;

    const memory = new MemorySystem(project.path);

    let memoryEntries = 0;
    let transcriptDays = 0;
    let wikiPages = 0;

    try {
      const entries = await memory.list();
      memoryEntries = entries.length;
    } catch { /* ignore */ }

    try {
      const transcriptDir = path.join(
        MemorySystem.rootFor(project.path),
        "transcripts"
      );
      const glob = new (await import("bun")).Glob("*.md");
      for await (const _ of glob.scan({ cwd: transcriptDir, onlyFiles: true })) {
        transcriptDays++;
      }
    } catch { /* ignore */ }

    try {
      const wikiDir = path.join(MemorySystem.rootFor(project.path), "wiki");
      const glob = new (await import("bun")).Glob("*.json");
      for await (const f of glob.scan({ cwd: wikiDir, onlyFiles: true })) {
        if (f !== "index.json") wikiPages++;
      }
    } catch { /* ignore */ }

    return { project, memoryEntries, transcriptDays, wikiPages };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async setStatus(idOrPath: string, status: ProjectStatus): Promise<boolean> {
    const registry = await this.loadRegistry();
    const absPath = path.resolve(idOrPath);
    const project = registry.projects.find(
      (p) => p.id === idOrPath || p.path === absPath || p.name === idOrPath
    );
    if (!project) return false;
    project.status = status;
    await this.saveRegistry(registry);
    return true;
  }

  private async loadRegistry(): Promise<ProjectRegistry> {
    try {
      const raw = await Bun.file(REGISTRY_FILE).text();
      return JSON.parse(raw) as ProjectRegistry;
    } catch {
      return { projects: [], updatedAt: new Date().toISOString() };
    }
  }

  private async saveRegistry(registry: ProjectRegistry): Promise<void> {
    registry.updatedAt = new Date().toISOString();
    // @ts-ignore
    await mkdir(path.dirname(REGISTRY_FILE), { recursive: true });
    await Bun.write(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  }
}
