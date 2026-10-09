import { describe, it, expect } from 'vitest';

const NODE_IMPORT = /from\s+['"]node:|^import\s+['"]node:|require\(['"]node:/;

declare global {
  interface ImportMeta {
    glob: (
      pattern: string | readonly string[],
      options: { query: string; eager: boolean; import: string }
    ) => Record<string, string>;
  }
}

const sources = import.meta.glob(
  ['../**/*.ts', '!**/*.spec.ts', '!**/spec-helpers.ts'],
  { query: '?raw', eager: true, import: 'default' }
);

describe('level-core isomorphic (browser-safe)', () => {
  it('production sources do not import node:* modules', () => {
    const violations: string[] = [];
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThan(0);

    for (const [path, raw] of files) {
      const lines = raw.split('\n');
      for (const [index, line] of lines.entries()) {
        if (NODE_IMPORT.test(line)) {
          violations.push(`${path}:${String(index + 1)}: ${line.trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
