import { watch as fsWatch } from "node:fs";
import { join, resolve } from "node:path";
import type { FSWatcher } from "node:fs";

export interface WatchEvent {
  type: "change" | "rename";
  filename: string;
  absolutePath: string;
}

export type WatchHandler = (event: WatchEvent) => void | Promise<void>;

export class FileWatcher {
  private watchers = new Map<string, FSWatcher>();

  watch(dir: string, handler: WatchHandler, opts: { recursive?: boolean } = {}): () => void {
    const absDir = resolve(dir);

    const watcher = fsWatch(
      absDir,
      { recursive: opts.recursive ?? true },
      (eventType, filename) => {
        if (!filename) return;
        void handler({
          type: eventType as "change" | "rename",
          filename,
          absolutePath: join(absDir, filename),
        });
      }
    );

    const id = `${absDir}-${Date.now()}`;
    this.watchers.set(id, watcher);

    return () => {
      watcher.close();
      this.watchers.delete(id);
    };
  }

  stopAll(): void {
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
  }
}
