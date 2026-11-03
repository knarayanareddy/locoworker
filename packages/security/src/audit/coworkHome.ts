/** Kept in sync with core's getCoworkHome() but without importing core. */
import { homedir } from "node:os";
import { join } from "node:path";

export function getCoworkHome(): string {
  return process.env.COWORK_HOME || join(homedir(), ".cowork");
}
