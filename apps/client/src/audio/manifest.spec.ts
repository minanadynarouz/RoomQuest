import { describe, expect, it } from 'vitest';
import {
  SOUND_KEYS,
  SOUND_MANIFEST,
  type SoundKey,
} from './manifest.js';

const STORE_EVENTS: SoundKey[] = [
  'pieceBuilt',
  'gateOpened',
  'slimeStunned',
  'slimeWoke',
  'gemCollected',
  'explorerBlocked',
  'explorerOutOfView',
  'beatCompleted',
  'won',
  'leverPulled',
  'pieceMoved',
  'platformAligned',
  'portalUsed',
];

describe('SOUND_MANIFEST', () => {
  it('defines every store event plus grab, invalidPlace, and F-07 HUD actions', () => {
    expect(new Set(SOUND_KEYS)).toEqual(
      new Set<SoundKey>([
        ...STORE_EVENTS,
        'grab',
        'invalidPlace',
        'pause',
        'resume',
        'replay',
        'exit',
      ])
    );
    for (const key of SOUND_KEYS) {
      const entry = SOUND_MANIFEST[key];
      expect(entry.gain).toBeGreaterThan(0);
      expect(entry.gain).toBeLessThanOrEqual(0.35);
      expect(typeof entry.spatial).toBe('boolean');
      expect(entry.synth).toBeTruthy();
    }
  });

  it('follows the toy-box direction', () => {
    expect(SOUND_MANIFEST.pieceBuilt.synth).toBe('woodClick');
    expect(SOUND_MANIFEST.grab.synth).toBe('woodClick');
    expect(SOUND_MANIFEST.gateOpened.synth).toBe('marimbaRise');
    expect(SOUND_MANIFEST.gemCollected.synth).toBe('marimbaRise');
    expect(SOUND_MANIFEST.beatCompleted.synth).toBe('marimbaRise');
    expect(SOUND_MANIFEST.invalidPlace.synth).toBe('mutedThud');
    expect(SOUND_MANIFEST.won.synth).toBe('chimeSting');
    expect(SOUND_MANIFEST.pause.synth).toBe('woodClick');
    expect(SOUND_MANIFEST.resume.synth).toBe('woodClick');
    expect(SOUND_MANIFEST.replay.synth).toBe('woodClick');
    expect(SOUND_MANIFEST.exit.synth).toBe('mutedThud');
    expect(SOUND_MANIFEST.explorerOutOfView.synth).toBe('voiceBlip');
    expect(SOUND_MANIFEST.explorerOutOfView.spatial).toBe(true);
    expect(SOUND_MANIFEST.explorerOutOfView.randomPitchCents).toBeGreaterThan(0);
  });

  it('ships procedural placeholders with no file override', () => {
    for (const key of SOUND_KEYS) {
      expect(SOUND_MANIFEST[key].file).toBeUndefined();
    }
  });
});
