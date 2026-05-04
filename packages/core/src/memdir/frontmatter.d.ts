/**
 * Tiny YAML-frontmatter codec — handles the subset we use for memory files
 * without pulling in a YAML dependency. Supports strings, numbers, booleans,
 * and string arrays (inline or block-style).
 */
export type Frontmatter = Record<string, string | number | boolean | string[]>;
export declare function serializeFrontmatter(fm: Frontmatter): string;
export declare function parseFrontmatter(input: string): {
    frontmatter: Frontmatter;
    body: string;
};
//# sourceMappingURL=frontmatter.d.ts.map