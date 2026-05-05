import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
export class TaskScheduler {
    tasks = new Map();
    timers = new Map();
    storagePath;
    onFire;
    constructor(projectRoot) {
        this.storagePath = join(homedir(), ".cowork", "kairos", "tasks.json");
    }
    async init() {
        await mkdir(join(homedir(), ".cowork", "kairos"), { recursive: true });
        await this.load();
    }
    onTaskFire(handler) {
        this.onFire = handler;
    }
    async schedule(opts) {
        const task = {
            id: randomUUID(),
            ...opts,
            status: "pending",
            runCount: 0,
        };
        if (task.kind === "interval" && task.intervalMs) {
            task.nextRunAt = new Date(Date.now() + task.intervalMs).toISOString();
        }
        else if (task.kind === "once" && task.runAt) {
            task.nextRunAt = task.runAt;
        }
        this.tasks.set(task.id, task);
        await this.save();
        this.startTimer(task);
        return task;
    }
    async cancel(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
        const timer = this.timers.get(taskId);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(taskId);
        }
        task.status = "cancelled";
        await this.save();
        return true;
    }
    list() {
        return [...this.tasks.values()];
    }
    get(id) {
        return this.tasks.get(id);
    }
    startTimer(task) {
        if (task.kind === "interval" && task.intervalMs) {
            const timer = setInterval(() => void this.fire(task.id), task.intervalMs);
            this.timers.set(task.id, timer);
        }
        else if (task.kind === "once" && task.runAt) {
            const delay = Math.max(0, new Date(task.runAt).getTime() - Date.now());
            const timer = setTimeout(() => void this.fire(task.id), delay);
            // Store as interval handle (compatible type via cast)
            this.timers.set(task.id, timer);
        }
    }
    async fire(taskId) {
        const task = this.tasks.get(taskId);
        if (!task || task.status === "cancelled")
            return;
        task.status = "running";
        task.lastRunAt = new Date().toISOString();
        task.runCount++;
        try {
            if (this.onFire)
                await this.onFire(task);
            task.status = task.kind === "once" ? "complete" : "pending";
        }
        catch {
            task.status = "failed";
        }
        if (task.kind === "interval" && task.intervalMs) {
            task.nextRunAt = new Date(Date.now() + task.intervalMs).toISOString();
        }
        if (task.maxRuns !== undefined && task.runCount >= task.maxRuns) {
            task.status = "complete";
            const timer = this.timers.get(taskId);
            if (timer) {
                clearInterval(timer);
                this.timers.delete(taskId);
            }
        }
        await this.save();
    }
    async load() {
        if (!existsSync(this.storagePath))
            return;
        try {
            const raw = await readFile(this.storagePath, "utf-8");
            const tasks = JSON.parse(raw);
            for (const t of tasks) {
                this.tasks.set(t.id, t);
                // Re-arm timers for surviving tasks
                if (t.status === "pending")
                    this.startTimer(t);
            }
        }
        catch {
            // corrupt file — start fresh
        }
    }
    async save() {
        const data = JSON.stringify([...this.tasks.values()], null, 2);
        await writeFile(this.storagePath, data, "utf-8");
    }
}
//# sourceMappingURL=TaskScheduler.js.map