import type { Provider, ProviderName } from "./ProviderInterface.js";
export type ProviderResolutionInput = {
    provider?: ProviderName;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    env: NodeJS.ProcessEnv;
};
export declare function resolveProvider(input: ProviderResolutionInput): Provider;
//# sourceMappingURL=ProviderRouter.d.ts.map