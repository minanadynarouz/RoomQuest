import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Walk up from `start` until `pnpm-workspace.yaml` is found. */
export function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not find repo root (pnpm-workspace.yaml) from ${start}`
      );
    }
    dir = parent;
  }
}
