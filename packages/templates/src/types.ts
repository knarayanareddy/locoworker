export interface TemplateFile {
  path: string;
  content: string;
  executable?: boolean;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  tags: string[];
  files: TemplateFile[];
  postInstall?: string[];   // shell commands to run after scaffold
  variables?: string[];     // variable names user must supply e.g. "projectName"
}

export interface ScaffoldOptions {
  targetDir: string;
  variables?: Record<string, string>;
  dryRun?: boolean;
  overwrite?: boolean;
}

export interface ScaffoldResult {
  filesCreated: string[];
  filesSkipped: string[];
  durationMs: number;
}
