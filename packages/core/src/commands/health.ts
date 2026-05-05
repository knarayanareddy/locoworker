import type { SlashCommand } from "./SlashCommand.js";
import { getPlatform, getNodeVersion, getMemoryUsage } from "../utils/health.js";

export const healthCommand: SlashCommand = {
  name: "health",
  description: "Display system health metrics (Node version, platform, memory).",
  async execute(_args, ctx) {
    const version = getNodeVersion();
    const platform = getPlatform();
    let memoryStats;

    try {
      memoryStats = await getMemoryUsage();
    } catch (e) {
      ctx.print(`Error fetching memory usage: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return "0 bytes";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    const lines = [
      "===================================================",
      "🚀 System Health Status",
      "===================================================",
      `• Node Version: ${version}`,
      `• Platform:     ${platform}`,
      `• Memory Usage:`,
      `    - RSS:        ${formatBytes(memoryStats.rss)}`,
      `    - Total Heap: ${formatBytes(memoryStats.heapTotal)}`,
      `    - Used Heap:  ${formatBytes(memoryStats.heapUsed)}`,
      "===================================================",
    ];

    ctx.print(lines.join("\n"));
  },
};
