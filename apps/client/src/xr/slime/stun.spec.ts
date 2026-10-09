import { describe, expect, it } from 'vitest';
import { SYNTHETIC_SLIME_PLAN } from '@roomquest/fixtures';
import { createGameStore } from '../../game/index.js';
import { emitSlimeStunned, isSlimeStunStillActive } from './stun.js';

describe('isSlimeStunStillActive', () => {
  it('ignores a historical slimeStunned once slimeWoke is the latest event', () => {
    const events = [
      { type: 'slimeStunned', placementId: 'p8' },
      { type: 'slimeWoke', placementId: 'p8' },
    ];
    expect(isSlimeStunStillActive(events, 'p8')).toBe(false);
    expect(
      isSlimeStunStillActive(
        [...events, { type: 'slimeStunned', placementId: 'p8' }],
        'p8'
      )
    ).toBe(true);
  });

  it('does not treat another placement stun as active', () => {
    const events = [{ type: 'slimeStunned', placementId: 'other' }];
    expect(isSlimeStunStillActive(events, 'p8')).toBe(false);
  });
});

describe('emitSlimeStunned', () => {
  it('emits once while stunned and again after slimeWoke', () => {
    let now = 0;
    const store = createGameStore({
      clock: {
        now: () => now,
      },
    });
    store.requestLevel();
    store.startSurveying();
    store.startBuilding(SYNTHETIC_SLIME_PLAN);
    store.startPlaying();

    expect(emitSlimeStunned(store, 'p8')).toBe(true);
    expect(emitSlimeStunned(store, 'p8')).toBe(false);
    expect(
      store.events.filter((event) => event.type === 'slimeStunned')
    ).toHaveLength(1);

    now = 4000;
    store.slimeWoke('p8');
    expect(emitSlimeStunned(store, 'p8')).toBe(true);
    expect(
      store.events.filter((event) => event.type === 'slimeStunned')
    ).toHaveLength(2);
  });
});
