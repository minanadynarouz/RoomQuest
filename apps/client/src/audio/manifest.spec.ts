import { describe, expect, it } from 'vitest';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { GameEvent } from '../game/types.js';
import {
  SOUND_KEYS,
  SOUND_MANIFEST,
  soundPublicUrl,
  type SoundKey,
} from './manifest.js';

const STORE_EVENTS: GameEvent['type'][] = [
  'pieceBuilt',
  'gateOpened',
  'slimeStunned',
  'gemCollected',
  'explorerBlocked',
  'explorerOutOfView',
  'beatCompleted',
  'won',
  'leverPulled',
];

describe('SOUND_MANIFEST', () => {
  it('defines every store event plus grab with file, gain, and spatial', () => {
    expect(SOUND_MANIFEST.grab.file).toBe('grab.ogg');
    expect(SOUND_MANIFEST.grab.spatial).toBe(false);
    expect(SOUND_MANIFEST.explorerOutOfView.spatial).toBe(true);
    for (const key of STORE_EVENTS) {
      const entry = SOUND_MANIFEST[key];
      expect(entry.file.length).toBeGreaterThan(0);
      expect(entry.gain).toBeGreaterThan(0);
      expect(entry.gain).toBeLessThanOrEqual(1);
      expect(typeof entry.spatial).toBe('boolean');
    }
    expect(SOUND_KEYS).toEqual(
      expect.arrayContaining<SoundKey>([...STORE_EVENTS, 'grab'])
    );
  });

  it('points each placeholder file at public/audio and stays under 300 KB', async () => {
    const dir = join(process.cwd(), 'public', 'audio');
    const names = await readdir(dir);
    let total = 0;
    const seen = new Set<string>();
    for (const key of SOUND_KEYS) {
      const { file } = SOUND_MANIFEST[key];
      expect(soundPublicUrl(file)).toMatch(new RegExp(`audio/${file}$`));
      expect(names).toContain(file);
      if (seen.has(file)) continue;
      seen.add(file);
      const info = await stat(join(dir, file));
      expect(info.size).toBeGreaterThan(100);
      total += info.size;
    }
    expect(total).toBeLessThan(300 * 1024);
  });
});
