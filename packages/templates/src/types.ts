export interface TemplateFile {
  path: string;
  content: string;
  executable?: boolean;
}

/**
 * R-13: postInstall commands are never executed as a shell string. Prefer the
 * explicit argv form; a legacy string is parsed with a strict tokenizer that
 * rejects shell metacharacters.
 */
export type PostInstallCommand =
  | string
  | { command: string; args?: string[] };

export interface Template {
  id: string;
  name: string;
  description: string;
  tags: string[];
  files: TemplateFile[];
  /** Opt-in only. Never executed unless allowPostInstall is explicitly true. */
  postInstall?: PostInstallCommand[];
  variables?: string[];     // variable names user must supply e.g. "projectName"
}

export interface ScaffoldOptions {
  targetDir: string;
  variables?: Record<string, string>;
  dryRun?: boolean;
  overwrite?: boolean;
  /** Explicit opt-in; defaults to false (postInstall is skipped entirely). */
  allowPostInstall?: boolean;
  /** Trusted operator allowlist of executables (or COWORK_TEMPLATE_ALLOWED_COMMANDS). */
  allowedPostInstallCommands?: readonly string[];
  /** Optional interactive approval per command. */
  approvePostInstall?: (command: string) => boolean | Promise<boolean>;
  /** Trusted resource-limit overrides (never from a template). */
  limits?: Partial<import("@cowork/security/utils").ResourceLimits>;
  env?: NodeJS.ProcessEnv;
}

export interface PostInstallOutcome {
  ran: string[];
  skipped: string[];
  failed: string[];
}

export interface ScaffoldResult {
  filesCreated: string[];
  filesSkipped: string[];
  durationMs: number;
  postInstall: PostInstallOutcome;
}
