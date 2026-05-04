import { PermissionLevel } from "../../permissions/PermissionLevel.js";
export const HttpFetch = {
    name: "HttpFetch",
    description: "Fetch a URL (GET by default). Supports JSON and Text. Useful for docs and APIs.",
    inputSchema: {
        type: "object",
        properties: {
            url: { type: "string" },
            method: { type: "string", default: "GET" },
            headers: { type: "object", additionalProperties: { type: "string" } },
            body: { type: "string" },
        },
        required: ["url"],
    },
    permissionLevel: PermissionLevel.READ_ONLY,
    async execute(input) {
        try {
            const res = await fetch(input.url, {
                method: input.method ?? "GET",
                headers: input.headers,
                body: input.body,
            });
            const text = await res.text();
            return {
                content: `Status: ${res.status}\n\n${text.slice(0, 50000)}`,
                isError: !res.ok,
            };
        }
        catch (err) {
            return { content: String(err), isError: true };
        }
    },
};
//# sourceMappingURL=HttpFetch.js.map