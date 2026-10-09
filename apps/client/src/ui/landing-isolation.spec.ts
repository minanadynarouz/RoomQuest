/**
 * The HUD must load with the XR chunk, not the landing entry.
 */

import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('landing isolation from HUD', () => {
  it('does not import ui/ or HudSystem from landing sources', async () => {
    const landingDir = join(process.cwd(), 'src', 'landing');
    const files = await readdir(landingDir);
    const violations: string[] = [];

    for (const name of files) {
      if (!name.endsWith('.ts') || name.endsWith('.spec.ts')) continue;
      const path = join(landingDir, name);
      const source = await readFile(path, 'utf8');
      if (
        source.includes("from '../ui/") ||
        source.includes('HudSystem') ||
        source.includes('uikitml') ||
        source.includes('DebugOverlaySystem') ||
        source.includes('rolling-fps') ||
        /from ['"]\.\.\/debug\//.test(source) ||
        /from ['"]\.\.\/xr\/(?!flags)/.test(source)
      ) {
        violations.push(path);
      }
    }

    const entry = await readFile(
      join(process.cwd(), 'src', 'index.ts'),
      'utf8'
    );
    expect(entry).toContain("import('./xr/index.js')");
    expect(entry).toContain("from './xr/flags.js'");
    expect(entry).not.toContain('HudSystem');
    expect(entry).not.toContain('DebugOverlaySystem');
    expect(violations).toEqual([]);
  });
});
