/**
 * @module health
 * @description Utility functions to fetch system environment details.
 */

import { isMainThread } from 'node:worker_threads';

/**
 * @returns {string} The Node.js version.
 */
export function getNodeVersion(): string {
  return process.version;
}

/**
 * @returns {string} The operating system platform (e.g., 'linux', 'darwin', 'win32').
 */
export function getPlatform(): string {
  return process.platform;
}

/**
 * @returns {Promise<{rss: number, heapTotal: number, heapUsed: number}>}
 * A promise resolving to an object containing memory usage statistics in bytes.
 * Throws an error if running in a non-main thread environment.
 */
export function getMemoryUsage(): Promise<{ rss: number, heapTotal: number, heapUsed: number }> {
  if (!isMainThread) {
    throw new Error("Memory usage can only be read reliably from the main thread context.");
  }
  // process.memoryUsage() returns the usage metrics
  return Promise.resolve(process.memoryUsage());
}