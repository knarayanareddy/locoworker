export type ProjectStatus = "active" | "archived" | "paused";

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  status: ProjectStatus;
  createdAt: string;
  lastAccessedAt: string;
  provider?: string;
  model?: string;
  tags?: string[];
  description?: string;
  memoryCount?: number;
  sessionCount?: number;
}

export interface ProjectRegistry {
  projects: ProjectRecord[];
  activeProjectId?: string;
  updatedAt: string;
}
