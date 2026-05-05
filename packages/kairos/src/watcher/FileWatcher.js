import { watch as fsWatch } from "node:fs";
import { join, resolve } from "node:path";
export class FileWatcher {
    watchers = new Map();
    watch(dir, handler, opts = {}) {
        const absDir = resolve(dir);
        const watcher = fsWatch(absDir, { recursive: opts.recursive ?? true }, (eventType, filename) => {
            if (!filename)
                return;
            void handler({
                type: eventType,
                filename,
                absolutePath: join(absDir, filename),
            });
        });
        const id = `${absDir}-${Date.now()}`;
        this.watchers.set(id, watcher);
        return () => {
            watcher.close();
            this.watchers.delete(id);
        };
    }
    stopAll() {
        for (const w of this.watchers.values())
            w.close();
        this.watchers.clear();
    }
}
//# sourceMappingURL=FileWatcher.js.map