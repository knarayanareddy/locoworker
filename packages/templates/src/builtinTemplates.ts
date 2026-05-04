import type { Template } from "./types";

export const TYPESCRIPT_LIB_TEMPLATE: Template = {
  id: "ts-lib",
  name: "TypeScript Library",
  description: "A TypeScript library package with Bun, tests, and cowork config",
  tags: ["typescript", "library", "bun"],
  variables: ["projectName", "description", "author"],
  files: [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: "{{projectName}}",
          version: "0.1.0",
          type: "module",
          description: "{{description}}",
          main: "./src/index.ts",
          scripts: { test: "bun test", typecheck: "tsc --noEmit" },
          author: "{{author}}",
        },
        null,
        2
      ),
    },
    {
      path: "src/index.ts",
      content: `/**\n * {{projectName}}\n * {{description}}\n */\n\nexport function hello(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n`,
    },
    {
      path: "src/index.test.ts",
      content: `import { hello } from ".";\nimport { expect, test } from "bun:test";\n\ntest("hello returns greeting", () => {\n  expect(hello("world")).toBe("Hello, world!");\n});\n`,
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            strict: true,
            outDir: "dist",
            declaration: true,
            types: ["bun-types"],
          },
          include: ["src/**/*"],
        },
        null,
        2
      ),
    },
    {
      path: "CLAUDE.md",
      content: `# {{projectName}}\n\n{{description}}\n\n## Project Structure\n\n- \`src/index.ts\` — main entry point\n- \`src/index.test.ts\` — tests\n\n## Commands\n\n- \`bun test\` — run tests\n- \`bun run typecheck\` — type check\n`,
    },
    {
      path: "SOUL.md",
      content: `# {{projectName}} Agent Persona\n\nWork on the {{projectName}} library.\nKeep code clean, well-typed, and tested.\nPrefer small targeted edits. Run tests after any code change.\n`,
    },
    {
      path: ".cowork/settings.json",
      content: JSON.stringify(
        { permissionMode: "STANDARD", maxTurns: 30, enableKairos: false },
        null,
        2
      ),
    },
    {
      path: ".gitignore",
      content: "node_modules/\ndist/\n.env\n*.env.local\n",
    },
  ],
};

export const FULLSTACK_APP_TEMPLATE: Template = {
  id: "fullstack",
  name: "Full Stack App",
  description: "Full stack Bun app with an API, frontend, and cowork config",
  tags: ["fullstack", "api", "bun"],
  variables: ["projectName", "description"],
  files: [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: "{{projectName}}",
          version: "0.1.0",
          type: "module",
          scripts: {
            dev: "bun run --watch src/server.ts",
            start: "bun run src/server.ts",
            test: "bun test",
          },
        },
        null,
        2
      ),
    },
    {
      path: "src/server.ts",
      content: `import { router } from "./router";\n\nBun.serve({\n  port: 3000,\n  fetch: router,\n});\n\nconsole.log("Server running on http://localhost:3000");\n`,
    },
    {
      path: "src/router.ts",
      content: `export async function router(req: Request): Promise<Response> {\n  const url = new URL(req.url);\n  \n  if (url.pathname === "/") {\n    return new Response("{{projectName}} API", { headers: { "Content-Type": "text/plain" } });\n  }\n  \n  if (url.pathname === "/health") {\n    return Response.json({ status: "ok", ts: Date.now() });\n  }\n  \n  return new Response("Not found", { status: 404 });\n}\n`,
    },
    {
      path: "src/server.test.ts",
      content: `import { router } from "./router";\nimport { expect, test } from "bun:test";\n\ntest("GET / returns app name", async () => {\n  const req = new Request("http://localhost:3000/");\n  const res = await router(req);\n  expect(res.status).toBe(200);\n});\n\ntest("GET /health returns ok", async () => {\n  const req = new Request("http://localhost:3000/health");\n  const res = await router(req);\n  const json = await res.json();\n  expect(json.status).toBe("ok");\n});\n`,
    },
    {
      path: "CLAUDE.md",
      content: `# {{projectName}}\n\n{{description}}\n\n## Architecture\n\n- \`src/server.ts\` — Bun HTTP server entry point\n- \`src/router.ts\` — request routing\n\n## Commands\n\n- \`bun run dev\` — dev server with hot reload\n- \`bun test\` — run tests\n`,
    },
    {
      path: ".gitignore",
      content: "node_modules/\ndist/\n.env\n*.env.local\n",
    },
  ],
};

export const AGENT_SCRIPT_TEMPLATE: Template = {
  id: "agent-script",
  name: "Agent Script",
  description: "A single-file agent script using cowork queryLoop directly",
  tags: ["agent", "script", "automation"],
  variables: ["scriptName", "description"],
  files: [
    {
      path: "{{scriptName}}.ts",
      content: `#!/usr/bin/env bun
/**
 * {{scriptName}}
 * {{description}}
 *
 * Usage: bun run {{scriptName}}.ts [prompt]
 */

import { queryLoop, resolveSettings, DEFAULT_TOOLS } from "@cowork/core";

const prompt = process.argv.slice(2).join(" ") || "Help me with this project.";
const settings = await resolveSettings(process.cwd(), process.env, {});

for await (const event of queryLoop(prompt, {
  settings,
  systemPrompt: "{{description}}",
  tools: DEFAULT_TOOLS,
  projectRoot: process.cwd(),
})) {
  if (event.type === "text") process.stdout.write((event as any).text ?? "");
  if (event.type === "complete") {
    const usage = (event as any).usage;
    process.stderr.write(\`\\n[done] in:\${usage?.inputTokens ?? 0} out:\${usage?.outputTokens ?? 0}\\n\`);
  }
}
`,
    },
    {
      path: "CLAUDE.md",
      content: `# {{scriptName}}\n\n{{description}}\n`,
    },
  ],
};

export const BUILTIN_TEMPLATES: Template[] = [
  TYPESCRIPT_LIB_TEMPLATE,
  FULLSTACK_APP_TEMPLATE,
  AGENT_SCRIPT_TEMPLATE,
];
