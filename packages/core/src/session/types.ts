// packages/core/src/session/types.ts

export type SessionStatus = "active" | "complete" | "error" | "interrupted";

export interface SessionRecord {
  id: string;
  name?: string;
  projectRoot: string;
  provider: string;
  model: string;
  permissionMode: string;
  status: SessionStatus;
  createdAt: string;       // ISO 8601
  updatedAt: string;
  completedAt?: string;
  summary?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  turns: number;
  transcriptPath?: string;
}

export interface CreateSessionOptions {
  id: string;
  name?: string;
  projectRoot: string;
  provider: string;
  model: string;
  permissionMode: string;
}

export interface UpdateSessionOptions {
  name?: string;
  status?: SessionStatus;
  summary?: string;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  turns?: number;
  transcriptPath?: string;
}
