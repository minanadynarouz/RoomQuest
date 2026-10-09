/**
 * F-08: store / UI event → sound id. Pure; no DOM or WebAudio.
 */

import type { GameEvent } from '../game/types.js';

export const SOUND_IDS = [
  'grab',
  'snap',
  'lever',
  'gate',
  'stun',
  'gem',
  'win',
  'chirp',
  'blocked',
  'beat',
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

/** Every F-02 `GameEvent` type maps to a SFX. */
export const SOUND_FOR_EVENT: Record<GameEvent['type'], SoundId> = {
  pieceBuilt: 'snap',
  gateOpened: 'gate',
  slimeStunned: 'stun',
  gemCollected: 'gem',
  explorerBlocked: 'blocked',
  explorerOutOfView: 'chirp',
  beatCompleted: 'beat',
  won: 'win',
  leverPulled: 'lever',
};

export type UiSoundId = 'grab';
