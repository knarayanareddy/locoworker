import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Scaffolder } from "../src/Scaffolder.js";
import { resolveScaffoldPath } from "../src/scaffoldPath.js";
import type { Template } from "../src/types.js";

let workDir = "";
let envScript = "";
let sleepScript = "";

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "cowork-scaffolder-"));
  envScript = join(workDir, "dump-env.cjs");
  await writeFile(
    envScript,
    'require("node:fs").writeFileSync(process.argv[2], JSON.stringify(process.env));\n',
  );
  sleepScript = join(workDir, "sleep.cjs");
  await writeFile(sleepScript, "setTimeout(() => {}, 10000);\n");
});

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

async function target(label: string): Promise<string> {
  const dir = join(workDir, label);
  await mkdir(dir, { recursive: true });
  return dir;
}

function template(files: Template["files"], postInstall?: Template["postInstall"]): Template {
  return {
    id: "test",
    name: "Test",
    description: "harmless local test template",
    tags: ["test"],
    files,
    postInstall,
  };
}

describe("R-13 / B4: template path traversal guard", () => {
  test("rejects ../ escapes and absolute paths", async () => {
    const dir = await target("escape");
    await expect(resolveScaffoldPath(dir, "../../outside.txt")).rejects.toThrow(/escapes/);
    await expect(resolveScaffoldPath(dir, "/etc/passwd")).rejects.toThrow(/absolute/);
    await expect(
      new Scaffolder().scaffold(
        template([{ path: "../escaped.txt", content: "bad" }]),
        { targetDir: dir },
      ),
    ).rejects.toThrow(/escapes/);
  });

  test("a ../ file is not created outside the target directory", async () => {
    const dir = await target("escape2");
    let threw = false;
    try {
      await new Scaffolder().scaffold(
        template([{ path: "../escaped.txt", content: "bad" }]),
        { targetDir: dir },
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    await expect(readFile(join(workDir, "escaped.txt"), "utf8")).rejects.toThrow();
  });

  test("rejects symlinks in the writable chain", async () => {
    const dir = await target("symlink");
    const outside = join(workDir, "outside-dir");
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(dir, "link"));
    await expect(resolveScaffoldPath(dir, "link/evil.txt")).rejects.toThrow(/symlink|escapes/);
    await expect(readFile(join(outside, "evil.txt"), "utf8")).rejects.toThrow();
  });

  test("rejects sensitive filenames", async () => {
    const dir = await target("sensitive");
    for (const name of [".env", ".env.local", "id_rsa", "credentials", "server.key"]) {
      await expect(resolveScaffoldPath(dir, name)).rejects.toThrow(/sensitive/);
    }
  });

  test("allows .cowork/settings.json and .gitignore (built-in templates)", async () => {
    const dir = await target("dotfiles");
    const result = await new Scaffolder().scaffold(
      template([
        { path: ".cowork/settings.json", content: "{}" },
        { path: ".gitignore", content: "dist/" },
      ]),
      { targetDir: dir },
    );
    expect(result.filesCreated).toHaveLength(2);
    expect(await readFile(join(dir, ".cowork/settings.json"), "utf8")).toBe("{}");
  });
});

describe("R-13 / B4: postInstall is opt-in, argv-only and filtered", () => {
  test("postInstall is skipped entirely by default", async () => {
    const dir = await target("default-off");
    const out = join(workDir, "default-off-env.json");
    const result = await new Scaffolder().scaffold(
      template([{ path: "README.md", content: "hello" }], [
        { command: process.execPath, args: [envScript, out] },
      ]),
      { targetDir: dir },
    );
    expect(result.postInstall.ran).toHaveLength(0);
    expect(result.postInstall.skipped).toHaveLength(1);
    await expect(readFile(out, "utf8")).rejects.toThrow();
  });

  test("an explicit opt-in without an executable allowlist still skips", async () => {
    const dir = await target("no-allowlist");
    const out = join(workDir, "no-allowlist-env.json");
    const result = await new Scaffolder().scaffold(
      template([], [{ command: process.execPath, args: [envScript, out] }]),
      { targetDir: dir, allowPostInstall: true, allowedPostInstallCommands: [] },
    );
    expect(result.postInstall.ran).toHaveLength(0);
    expect(result.postInstall.skipped[0]).toMatch(/not allowlisted/);
  });

  test("shell strings are refused", async () => {
    const dir = await target("shell-string");
    const result = await new Scaffolder().scaffold(
      template([], ["echo hi && rm -rf /", { command: "/bin/sh", args: ["-c", "echo hi"] }]),
      { targetDir: dir, allowPostInstall: true, allowedPostInstallCommands: ["sh", "echo"] },
    );
    expect(result.postInstall.ran).toHaveLength(0);
    expect(result.postInstall.skipped).toHaveLength(2);
    expect(result.postInstall.skipped[0]).toMatch(/shell metacharacters/);
    expect(result.postInstall.skipped[1]).toMatch(/shell -c/);
  });

  test("an allowlisted argv command runs without credentials in the child env", async () => {
    const dir = await target("allowlisted");
    const out = join(workDir, "allowlisted-env.json");
    const result = await new Scaffolder().scaffold(
      template([], [{ command: process.execPath, args: [envScript, out] }]),
      {
        targetDir: dir,
        allowPostInstall: true,
        allowedPostInstallCommands: [process.execPath],
        env: {
          ...process.env,
          OPENAI_API_KEY: "sk-do-not-leak",
          COWORK_API_KEY: "also-secret",
          ANTHROPIC_API_KEY: "sk-ant-secret",
        } as NodeJS.ProcessEnv,
      },
    );
    expect(result.postInstall.ran).toHaveLength(1);
    expect(result.postInstall.failed).toHaveLength(0);
    const childEnv = JSON.parse(await readFile(out, "utf8")) as Record<string, string>;
    expect(childEnv.OPENAI_API_KEY).toBeUndefined();
    expect(childEnv.ANTHROPIC_API_KEY).toBeUndefined();
    expect(childEnv.COWORK_API_KEY).toBeUndefined();
  });

  test("a hung command is killed by the timeout and reported as failed", async () => {
    const dir = await target("timeout");
    const started = Date.now();
    const result = await new Scaffolder().scaffold(
      template([], [{ command: process.execPath, args: [sleepScript] }]),
      {
        targetDir: dir,
        allowPostInstall: true,
        allowedPostInstallCommands: [process.execPath],
        limits: { templatePostInstallTimeoutMs: 150 },
      },
    );
    expect(result.postInstall.ran).toHaveLength(0);
    expect(result.postInstall.failed).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test("interactive approval can veto a command", async () => {
    const dir = await target("veto");
    const result = await new Scaffolder().scaffold(
      template([], [{ command: process.execPath, args: [envScript, join(workDir, "veto.json")] }]),
      {
        targetDir: dir,
        allowPostInstall: true,
        allowedPostInstallCommands: [process.execPath],
        approvePostInstall: () => false,
      },
    );
    expect(result.postInstall.skipped[0]).toMatch(/not approved/);
    expect(result.postInstall.ran).toHaveLength(0);
  });

  test("file count, per-file and total byte caps are enforced", async () => {
    const dir = await target("caps");
    const scaffolder = new Scaffolder();
    await expect(
      scaffolder.scaffold(template([
        { path: "a.txt", content: "a" },
        { path: "b.txt", content: "b" },
      ]), { targetDir: dir, limits: { maxTemplateFiles: 1 } }),
    ).rejects.toThrow(/cap 1/);
    await expect(
      scaffolder.scaffold(template([
        { path: "big.txt", content: "x".repeat(200) },
      ]), { targetDir: dir, limits: { maxTemplateFileBytes: 10 } }),
    ).rejects.toThrow(/bytes \(cap 10\)/);
    await expect(
      scaffolder.scaffold(template([
        { path: "a.txt", content: "x".repeat(20) },
        { path: "b.txt", content: "x".repeat(20) },
      ]), { targetDir: dir, limits: { maxTemplateTotalBytes: 25 } }),
    ).rejects.toThrow(/total cap/);
  });
});
