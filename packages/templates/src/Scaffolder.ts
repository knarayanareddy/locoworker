import type { Template, ScaffoldOptions, ScaffoldResult } from "./types";
import mkdir from "node:fs/promises";
import path from "path";

export class Scaffolder {
  async scaffold(template: Template, opts: ScaffoldOptions): Promise<ScaffoldResult> {
    const startMs = Date.now();
    const filesCreated: string[] = [];
    const filesSkipped: string[] = [];

    // @ts-ignore
    await mkdir(opts.targetDir, { recursive: true });

    for (const file of template.files) {
      // Substitute variables in path and content
      const filePath = this.substitute(file.path, opts.variables ?? {});
      const content = this.substitute(file.content, opts.variables ?? {});
      const absPath = path.join(opts.targetDir, filePath);

      // Check if file exists
      if (!opts.overwrite) {
        try {
          await Bun.file(absPath).text();
          filesSkipped.push(filePath);
          continue;
        } catch { /* doesn't exist, proceed */ }
      }

      if (opts.dryRun) {
        filesCreated.push(filePath);
        continue;
      }

      // Create parent dirs
      // @ts-ignore
      await mkdir(path.dirname(absPath), { recursive: true });
      await Bun.write(absPath, content);
      filesCreated.push(filePath);
    }

    // Run post-install commands
    if (!opts.dryRun && template.postInstall?.length) {
      for (const cmd of template.postInstall) {
        const proc = Bun.spawn(["bash", "-c", cmd], {
          cwd: opts.targetDir,
          stdout: "inherit",
          stderr: "inherit",
        });
        await proc.exited;
      }
    }

    return {
      filesCreated,
      filesSkipped,
      durationMs: Date.now() - startMs,
    };
  }

  private substitute(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{{${key}}}`
    );
  }
}
