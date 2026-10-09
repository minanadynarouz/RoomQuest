/**
 * F-08 sound manifest — the only place gameplay SFX are defined.
 *
 * Direction (design lead): warm, small, wooden toy-box; short, dry, quiet
 * under passthrough. No music bed during play. These are procedural
 * placeholders — swap later without touching the manager, engine, or boot:
 *
 * 1. Tweak `synth` / `gain` / `spatial` / `pitchHz` / `duration` /
 *    `randomPitchCents` / `intervals` here, or
 * 2. Set `file` to a CC0 clip in `public/audio/` (file wins over synth).
 *
 * Then list any new file in `apps/client/public/LICENSES.md`.
 */

import type { GameEvent } from '../game/types.js';

export type SynthKind =
  | 'woodClick'
  | 'marimbaRise'
  | 'mutedThud'
  | 'voiceBlip'
  | 'chimeSting';

export interface SoundEntry {
  /** Optional CC0 file under `public/audio/`. When set, plays instead of synth. */
  file?: string;
  /** Procedural recipe (filtered noise, decaying sines/triangles, etc.). */
  synth: SynthKind;
  /** Per-clip gain in 0–1, multiplied with the master volume. Keep conservative. */
  gain: number;
  /** When true, play through a PannerNode at F-06 ExplorerTarget. */
  spatial: boolean;
  /** Base pitch for pitched recipes (Hz). */
  pitchHz?: number;
  /** Voice length in seconds. */
  duration?: number;
  /** Randomise pitch by ± this many cents (explorer chirps). */
  randomPitchCents?: number;
  /** Marimba note offsets in semitones from `pitchHz`. */
  intervals?: readonly number[];
}

/** Store events plus pinch/grab and invalid place/tray-return. */
export type SoundKey = GameEvent['type'] | 'grab' | 'invalidPlace';

export const SOUND_MANIFEST: Record<SoundKey, SoundEntry> = {
  grab: {
    synth: 'woodClick',
    gain: 0.2,
    spatial: false,
    pitchHz: 1700,
    duration: 0.045,
  },
  pieceBuilt: {
    synth: 'woodClick',
    gain: 0.28,
    spatial: false,
    pitchHz: 1500,
    duration: 0.055,
  },
  leverPulled: {
    synth: 'woodClick',
    gain: 0.24,
    spatial: false,
    pitchHz: 1100,
    duration: 0.06,
  },
  invalidPlace: {
    synth: 'mutedThud',
    gain: 0.26,
    spatial: false,
    pitchHz: 88,
    duration: 0.13,
  },
  gateOpened: {
    synth: 'marimbaRise',
    gain: 0.24,
    spatial: false,
    pitchHz: 523.25,
    duration: 0.2,
    intervals: [0, 5],
  },
  gemCollected: {
    synth: 'marimbaRise',
    gain: 0.26,
    spatial: false,
    pitchHz: 659.25,
    duration: 0.18,
    intervals: [0, 4],
  },
  beatCompleted: {
    synth: 'marimbaRise',
    gain: 0.22,
    spatial: false,
    pitchHz: 587.33,
    duration: 0.18,
    intervals: [0, 7],
  },
  slimeStunned: {
    synth: 'marimbaRise',
    gain: 0.2,
    spatial: false,
    pitchHz: 392,
    duration: 0.16,
    intervals: [0, 3],
  },
  explorerBlocked: {
    synth: 'mutedThud',
    gain: 0.2,
    spatial: false,
    pitchHz: 100,
    duration: 0.11,
  },
  explorerOutOfView: {
    synth: 'voiceBlip',
    gain: 0.2,
    spatial: true,
    pitchHz: 490,
    duration: 0.075,
    randomPitchCents: 380,
  },
  won: {
    synth: 'chimeSting',
    gain: 0.3,
    spatial: false,
    pitchHz: 1046.5,
    duration: 0.45,
  },
};

export const SOUND_KEYS = Object.keys(SOUND_MANIFEST) as SoundKey[];

export function soundPublicUrl(file: string): string {
  const raw = import.meta.env.BASE_URL;
  const prefix = raw.endsWith('/') ? raw : `${raw}/`;
  const name = file.replace(/^\/+/u, '').replace(/^audio\//u, '');
  return `${prefix}audio/${name}`;
}
