import { describe, expect, it } from 'vitest';
import { SYNTHETIC_SLIME_PLAN } from '@roomquest/fixtures';
import { createGameStore } from '../../game/index.js';
import { emitSlimeStunned } from './stun.js';

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
