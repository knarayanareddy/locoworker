#!/usr/bin/env bun
/**
 * cowork-dashboard — lightweight web dashboard
 *
 * Usage:
 *   bun run apps/dashboard/src/server.ts [--port 3720] [--project /path]
 *
 * Opens at http://localhost:3720
 * Provides: memory browser, analytics, audit log, wiki pages, session status
 */

import { DashboardRouter } from "./DashboardRouter";

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const port = parseInt(getArg("--port") ?? "3720");
const projectRoot = getArg("--project") ?? process.cwd();

const router = new DashboardRouter({ projectRoot, port });
await router.start();
