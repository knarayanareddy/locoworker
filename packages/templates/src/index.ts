export { Scaffolder } from "./Scaffolder";
export { resolveScaffoldPath, ScaffoldPathError } from "./scaffoldPath";
export { BUILTIN_TEMPLATES, TYPESCRIPT_LIB_TEMPLATE, FULLSTACK_APP_TEMPLATE, AGENT_SCRIPT_TEMPLATE } from "./builtinTemplates";
export type {
  Template,
  TemplateFile,
  ScaffoldOptions,
  ScaffoldResult,
  PostInstallCommand,
  PostInstallOutcome,
} from "./types";
