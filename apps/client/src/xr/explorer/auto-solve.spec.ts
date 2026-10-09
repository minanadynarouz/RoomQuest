import { describe, expect, it } from 'vitest';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
  SYNTHETIC_PLATFORM_PORTAL_PLAN,
  SYNTHETIC_SLIME_PLAN,
} from '@roomquest/fixtures';
import { explorerPath } from '@roomquest/level-core';
import { createGameStore } from '../../game/index.js';
import { autoSolve } from './auto-solve.js';
import { ExplorerWalker } from './walker.js';

describe('autoSolve', () => {
  it('reaches won on the synthetic living-room fixture', () => {
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

    const walker = new ExplorerWalker();
    walker.begin(
      explorerPath(SYNTHETIC_LIVING_ROOM_PLAN, SYNTHETIC_LIVING_ROOM),
      SYNTHETIC_LIVING_ROOM_PLAN,
      store
    );

    autoSolve({ store, plan: SYNTHETIC_LIVING_ROOM_PLAN });

    for (let i = 0; i < 80; i += 1) {
      now += 1000;
      walker.update(1, now / 1000);
      if (store.phase === 'won') break;
    }

    expect(store.phase).toBe('won');
    expect(store.events.some((e) => e.type === 'won')).toBe(true);
    expect(store.events.some((e) => e.type === 'pieceBuilt')).toBe(true);
    expect(store.events.some((e) => e.type === 'leverPulled')).toBe(true);
    expect(store.events.some((e) => e.type === 'gateOpened')).toBe(true);
    expect(store.events.filter((e) => e.type === 'beatCompleted').length).toBe(
      SYNTHETIC_LIVING_ROOM_PLAN.beats.length
    );
    expect(store.events.some((e) => e.type === 'gemCollected')).toBe(true);
    expect(walker.state).toBe('celebrating');
  });

  it('aligns platforms on the platform-portal fixture and reaches won', () => {
    let now = 0;
    const store = createGameStore({
      clock: {
        now: () => now,
      },
    });
    store.requestLevel();
    store.startSurveying();
    store.startBuilding(SYNTHETIC_PLATFORM_PORTAL_PLAN);
    store.startPlaying();

    const walker = new ExplorerWalker();
    walker.begin(
      explorerPath(SYNTHETIC_PLATFORM_PORTAL_PLAN, SYNTHETIC_LIVING_ROOM),
      SYNTHETIC_PLATFORM_PORTAL_PLAN,
      store
    );

    autoSolve({ store, plan: SYNTHETIC_PLATFORM_PORTAL_PLAN });

    expect(store.events.some((e) => e.type === 'platformAligned')).toBe(true);

    for (let i = 0; i < 120; i += 1) {
      now += 1000;
      walker.update(1, now / 1000);
      if (store.phase === 'won') break;
    }

    expect(store.phase).toBe('won');
    expect(store.events.some((e) => e.type === 'portalUsed')).toBe(true);
    expect(walker.state).toBe('celebrating');
  });

  it('stuns slimes through emitSlimeStunned on the X-08 fixture', () => {
    const store = createGameStore({
      clock: {
        now: () => 0,
      },
    });
    store.requestLevel();
    store.startSurveying();
    store.startBuilding(SYNTHETIC_SLIME_PLAN);
    store.startPlaying();

    autoSolve({ store, plan: SYNTHETIC_SLIME_PLAN });

    expect(
      store.events.some(
        (event) => event.type === 'slimeStunned' && event.placementId === 'p8'
      )
    ).toBe(true);
  });

  it('stuns slimes via the SlimeSystem stun hook when provided', () => {
    const store = createGameStore({
      clock: {
        now: () => 0,
      },
    });
    store.requestLevel();
    store.startSurveying();
    store.startBuilding(SYNTHETIC_SLIME_PLAN);
    store.startPlaying();

    const stunned: string[] = [];
    autoSolve({
      store,
      plan: SYNTHETIC_SLIME_PLAN,
      slime: {
        stun: (id) => {
          stunned.push(id);
          store.slimeStunned(id);
          return true;
        },
        boundCount: () => 1,
        isAwake: () => false,
        canPass: () => true,
      },
    });

    expect(stunned).toEqual(['p8']);
    expect(
      store.events.some(
        (event) => event.type === 'slimeStunned' && event.placementId === 'p8'
      )
    ).toBe(true);
  });
});
