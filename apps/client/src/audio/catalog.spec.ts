import { describe, expect, it } from 'vitest';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { SOUND_IDS } from './mapping.js';
import { SOUND_URLS } from './catalog.js';

describe('CC0 SFX catalog', () => {
  it('keeps compressed gameplay audio under 300 KB', async () => {
    const dir = join(process.cwd(), 'public', 'audio');
    let total = 0;
    for (const id of SOUND_IDS) {
      expect(SOUND_URLS[id]).toMatch(new RegExp(`audio/${id}\\.ogg$`));
      const info = await stat(join(dir, `${id}.ogg`));
      expect(info.size).toBeGreaterThan(100);
      total += info.size;
    }
    expect(total).toBeLessThan(300 * 1024);
    const names = await readdir(dir);
    for (const id of SOUND_IDS) {
      expect(names).toContain(`${id}.ogg`);
    }
  });
});
