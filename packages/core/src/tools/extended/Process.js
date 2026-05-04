import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import { spawn } from "bun";
export const ProcessList = {
    name: "ProcessList",
    description: "List running processes (ps aux).",
    inputSchema: { type: "object", properties: {} },
    permissionLevel: PermissionLevel.READ_ONLY,
    async execute(_, _ctx) {
        const proc = spawn(["ps", "aux"], { stdout: "pipe" });
        const out = await new Response(proc.stdout).text();
        return { content: out.slice(0, 50000), isError: false };
    },
};
export const ProcessKill = {
    name: "ProcessKill",
    description: "Kill a process by PID. DANGEROUS.",
    inputSchema: {
        type: "object",
        properties: { pid: { type: "number" } },
        required: ["pid"],
    },
    permissionLevel: PermissionLevel.DANGEROUS,
    async execute(input) {
        const proc = spawn(["kill", "-9", String(input.pid)]);
        await proc.exited;
        return { content: `Killed process ${input.pid}`, isError: proc.exitCode !== 0 };
    },
};
//# sourceMappingURL=Process.js.map