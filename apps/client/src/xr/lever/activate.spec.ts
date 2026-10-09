import { describe, expect, it } from 'vitest';
import { SYNTHETIC_LIVING_ROOM_PLAN } from '@roomquest/fixtures';
import { createGameStore } from '../../game/index.js';
import { pullLever } from './activate.js';

function playingStore() {
  let now = 0;
  const store = createGameStore({
    clock: {
      now: () => now,
    },
  });
  store.requestLevel();
  store.startSurveying();
  store.startBuilding(SYNTHETIC_LIVING_ROOM_PLAN);
  store.startPlaying();
  now += 100;
  return { store };
}

describe('pullLever', () => {
  it('emits leverPulled then gateOpened for the fixture link', () => {
    const { store } = playingStore();
    expect(pullLever(store, SYNTHETIC_LIVING_ROOM_PLAN, 'p4')).toBe(true);
    expect(store.events.map((e) => e.type)).toEqual([
      'leverPulled',
      'gateOpened',
    ]);
    expect(store.events[0]).toMatchObject({
      type: 'leverPulled',
      placementId: 'p4',
    });
    expect(store.events[1]).toMatchObject({
      type: 'gateOpened',
      placementId: 'p3',
    });
  });

  it('is idempotent', () => {
    const { store } = playingStore();
    expect(pullLever(store, SYNTHETIC_LIVING_ROOM_PLAN, 'p4')).toBe(true);
    expect(pullLever(store, SYNTHETIC_LIVING_ROOM_PLAN, 'p4')).toBe(false);
    expect(store.events.filter((e) => e.type === 'leverPulled')).toHaveLength(
      1
    );
    expect(store.events.filter((e) => e.type === 'gateOpened')).toHaveLength(1);
  });

  it('rejects a non-lever id', () => {
    const { store } = playingStore();
    expect(pullLever(store, SYNTHETIC_LIVING_ROOM_PLAN, 'p3')).toBe(false);
    expect(store.events).toEqual([]);
  });
});
