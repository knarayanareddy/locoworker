export interface WatchEvent {
    type: "change" | "rename";
    filename: string;
    absolutePath: string;
}
export type WatchHandler = (event: WatchEvent) => void | Promise<void>;
export declare class FileWatcher {
    private watchers;
    watch(dir: string, handler: WatchHandler, opts?: {
        recursive?: boolean;
    }): () => void;
    stopAll(): void;
}
//# sourceMappingURL=FileWatcher.d.ts.map