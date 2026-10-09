/**
 * F-08 sound manifest — the only place gameplay SFX are defined.
 *
 * These clips are **placeholders**. Final art and sound direction comes from
 * the design lead. Swap without touching the manager, engine, or boot:
 *
 * 1. Drop a new CC0 (or licensed) file into `apps/client/public/audio/`
 *    using the same `file` name, or
 * 2. Change `file` / `gain` (0–1) / `spatial` in this object only.
 *
 * Then list the new file in `apps/client/public/LICENSES.md`.
 */

import type { GameEvent } from '../game/types.js';

export interface SoundEntry {
  /** Filename under `public/audio/`. */
  file: string;
  /** Per-clip gain in 0–1, multiplied with the master volume. */
  gain: number;
  /** When true, play through a PannerNode at F-06 ExplorerTarget. */
  spatial: boolean;
}

/** Store events plus the pinch/grab UI cue. */
export type SoundKey = GameEvent['type'] | 'grab';

export const SOUND_MANIFEST: Record<SoundKey, SoundEntry> = {
  grab: { file: 'grab.ogg', gain: 0.45, spatial: false },
  pieceBuilt: { file: 'snap.ogg', gain: 0.55, spatial: false },
  leverPulled: { file: 'lever.ogg', gain: 0.5, spatial: false },
  gateOpened: { file: 'gate.ogg', gain: 0.55, spatial: false },
  slimeStunned: { file: 'stun.ogg', gain: 0.5, spatial: false },
  gemCollected: { file: 'gem.ogg', gain: 0.5, spatial: false },
  won: { file: 'win.ogg', gain: 0.6, spatial: false },
  explorerOutOfView: { file: 'chirp.ogg', gain: 0.4, spatial: true },
  explorerBlocked: { file: 'blocked.ogg', gain: 0.45, spatial: false },
  beatCompleted: { file: 'beat.ogg', gain: 0.35, spatial: false },
};

export const SOUND_KEYS = Object.keys(SOUND_MANIFEST) as SoundKey[];

export function soundPublicUrl(file: string): string {
  const raw = import.meta.env.BASE_URL;
  const prefix = raw.endsWith('/') ? raw : `${raw}/`;
  const name = file.replace(/^\/+/u, '').replace(/^audio\//u, '');
  return `${prefix}audio/${name}`;
}
