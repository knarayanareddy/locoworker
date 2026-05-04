import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import { createHash } from "node:crypto";
import path from "path";
export const HashFile = {
    name: "HashFile",
    description: "Compute a hash of a file or string. Algorithms: sha256 (default), sha512, md5.",
    inputSchema: {
        type: "object",
        properties: {
            filePath: { type: "string" },
            text: { type: "string" },
            algorithm: { type: "string", enum: ["sha256", "sha512", "md5"], default: "sha256" },
        },
    },
    permissionLevel: PermissionLevel.READ_ONLY,
    async execute(input, ctx) {
        const algo = input.algorithm ?? "sha256";
        let data;
        if (input.text) {
            data = input.text;
        }
        else if (input.filePath) {
            const p = path.resolve(ctx.workingDirectory, input.filePath);
            data = await Bun.file(p).text();
        }
        else {
            return { content: "Provide filePath or text", isError: true };
        }
        const hash = createHash(algo).update(data).digest("hex");
        return { content: `${algo}: ${hash}`, isError: false };
    },
};
//# sourceMappingURL=Hash.js.map