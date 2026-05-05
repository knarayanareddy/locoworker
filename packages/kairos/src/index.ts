export * from "./scheduler/index.js";
export * from "./watcher/index.js";
export * from "./daemon/index.js";
export * from "./ipc.js";

// Aliases for compatibility with other packages
export type { ScheduledTask as KairosTask } from "./scheduler/types.js";
export type { DaemonConfig as KairosConfig } from "./daemon/KairosDaemon.js";
export { KairosDaemon as KAIROSDaemon } from "./daemon/KairosDaemon.js";
