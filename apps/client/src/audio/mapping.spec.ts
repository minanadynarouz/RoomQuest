import { describe, expect, it } from 'vitest';
import { SOUND_FOR_EVENT, SOUND_IDS, type SoundId } from './mapping.js';
import type { GameEvent } from '../game/types.js';

describe('SOUND_FOR_EVENT', () => {
  it('maps every F-02 store event to a catalogued sound', () => {
    const expected: Record<GameEvent['type'], SoundId> = {
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
    expect(SOUND_FOR_EVENT).toEqual(expected);
  });

  it('uses only known sound ids', () => {
    const ids = new Set<string>(SOUND_IDS);
    for (const sound of Object.values(SOUND_FOR_EVENT)) {
      expect(ids.has(sound)).toBe(true);
    }
  });
});
