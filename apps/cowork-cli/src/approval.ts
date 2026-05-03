import { createInterface } from "node:readline/promises";

export type ApprovalFn = (toolName: string, input: Record<string, unknown>) => Promise<boolean>;

export function makeApproval(opts: { autoApprove: boolean }): ApprovalFn {
  if (opts.autoApprove) {
    return async () => true;
  }

  return async (toolName, input) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const summary = JSON.stringify(input).slice(0, 200);
      const answer = await rl.question(
        `\n  Approve ${toolName}? ${summary}\n  [y/N] `,
      );
      return answer.trim().toLowerCase().startsWith("y");
    } finally {
      rl.close();
    }
  };
}
