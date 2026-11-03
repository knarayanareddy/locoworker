import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { guardPath, resolveInside, PathEscapeError } from "../src/tools/files/pathGuard.js";
import { ReadFileTool } from "../src/tools/files/ReadFileTool.js";
import { PermissionLevel } from "../src/permissions/PermissionLevel.js";

describe("path containment", () => {
  test("rejects lexical escapes and absolute paths outside the root", async () => {
    const root = await mkdtemp(join(tmpdir(), "cowork-path-"));
    try {
      const r = await guardPath(root, "../outside.txt");
      expect(r.error).toMatch(/escapes the project root/);
      await expect(resolveInside(root, "/etc/passwd")).rejects.toBeInstanceOf(PathEscapeError);
      expect((await guardPath(root, "src/file.txt")).path).toBe(join(root, "src/file.txt"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects symlinks that point outside the root", async () => {
    const base = await mkdtemp(join(tmpdir(), "cowork-symlink-"));
    const root = join(base, "project");
    const outside = join(base, "secret");
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "key.txt"), "secret", "utf-8");
    await symlink(outside, join(root, "link"));
    try {
      const r = await guardPath(root, "link/key.txt");
      expect(r.error).toMatch(/symlink/);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("Read tool refuses to read outside its working directory", async () => {
    const base = await mkdtemp(join(tmpdir(), "cowork-read-"));
    const root = join(base, "project");
    await mkdir(root, { recursive: true });
    await writeFile(join(base, "secret.txt"), "secret", "utf-8");
    try {
      const result = await ReadFileTool.execute(
        { path: "../secret.txt" },
        { workingDirectory: root, permissionLevel: PermissionLevel.READ_ONLY },
      );
      expect(result.isError).toBe(true);
      expect(result.content).toMatch(/escapes/);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
