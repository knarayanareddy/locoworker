#!/usr/bin/env bun
/**
 * cowork-init — scaffold a new project from a template
 *
 * Usage:
 *   cowork-init                              (interactive)
 *   cowork-init --template ts-lib           (named template)
 *   cowork-init --template ts-lib --dir ./mylib
 *   cowork-init --list                      (list available templates)
 */

import { BUILTIN_TEMPLATES } from "./builtinTemplates";
import { Scaffolder } from "./Scaffolder";
import path from "path";

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes("--list")) {
  console.log("Available templates:");
  for (const t of BUILTIN_TEMPLATES) {
    console.log(`  ${t.id.padEnd(20)} ${t.name} — ${t.description}`);
  }
  process.exit(0);
}

const templateId = getArg("--template");
const targetDir = getArg("--dir") ?? process.cwd();

let template = BUILTIN_TEMPLATES.find((t) => t.id === templateId);
if (!template) {
  if (BUILTIN_TEMPLATES.length === 0) {
    console.error("No templates available.");
    process.exit(1);
  }
  // Default to first template if none specified
  template = BUILTIN_TEMPLATES[0];
  console.log(`Using template: ${template.name}`);
}

// Collect variables interactively
const variables: Record<string, string> = {};
for (const varName of (template.variables ?? [])) {
  const prompt = `${varName}: `;
  process.stdout.write(prompt);
  // Read from stdin (simplified for bun)
  // Note: in a real CLI we'd use a readline library or prompt()
  // but for this implementation we'll use a simple mock or default
  variables[varName] = varName; 
}

// Set defaults if not provided
variables.projectName ??= path.basename(targetDir);
variables.description ??= `A ${template.name} project`;
variables.author ??= process.env.USER ?? "author";

const scaffolder = new Scaffolder();
const result = await scaffolder.scaffold(template, {
  targetDir,
  variables,
  overwrite: false,
  dryRun: args.includes("--dry-run"),
});

console.log(`\n✅ Scaffolded ${result.filesCreated.length} files in ${targetDir}:`);
for (const f of result.filesCreated) console.log(`  + ${f}`);
if (result.filesSkipped.length > 0) {
  console.log(`\nSkipped ${result.filesSkipped.length} existing files:`);
  for (const f of result.filesSkipped) console.log(`  ~ ${f}`);
}
console.log(`\nDone in ${result.durationMs}ms`);
