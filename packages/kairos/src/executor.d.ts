import type { KairosTask, KairosConfig } from "./types";
/**
 * Central dispatcher — routes a task to its handler by task.id prefix.
 */
export declare function executeKairosTask(task: KairosTask, config: KairosConfig): Promise<void>;
//# sourceMappingURL=executor.d.ts.map