import { describe, expect, it } from 'vitest';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { explorerPath } from '@roomquest/level-core';
import type { LevelPlan } from '@roomquest/schema';
import { createGameStore } from '../../game/index.js';
import { ExplorerWalker } from './walker.js';

const GRAPH = SYNTHETIC_LIVING_ROOM;
const PLAN = SYNTHETIC_LIVING_ROOM_PLAN;

function playing(plan: LevelPlan = PLAN) {
  let now = 0;
  const store = createGameStore({
    clock: {
      now: () => now,
    },
  });
  store.requestLevel();
  store.startSurveying();
  store.startBuilding(plan);
  store.startPlaying();
  const walker = new ExplorerWalker();
  walker.begin(explorerPath(plan, GRAPH), plan, store);
  const tick = (steps: number, dt = 0.25): void => {
    for (let i = 0; i < steps; i += 1) {
      now += dt * 1000;
      walker.update(dt, now / 1000);
    }
  };
  return { store, walker, tick };
}

describe('ExplorerWalker blockers', () => {
  it('stops at an unbuilt gap and resumes on pieceBuilt', () => {
    const { store, walker, tick } = playing();
    tick(80);
    expect(walker.state).toBe('blocked');
    expect(walker.reason).toBe('unbuiltGap');
    expect(
      store.events.some(
        (e) => e.type === 'explorerBlocked' && e.reason === 'unbuiltGap'
      )
    ).toBe(true);

    store.pieceBuilt('p2');
    tick(4);
    expect(walker.reason).not.toBe('unbuiltGap');
    expect(
      store.events.filter(
        (e) => e.type === 'explorerBlocked' && e.reason === 'unbuiltGap'
      )
    ).toHaveLength(1);
  });

  it('stops at a closed gate and resumes on gateOpened', () => {
    const { store, walker, tick } = playing();
    store.pieceBuilt('p2');
    tick(120);
    expect(walker.state).toBe('blocked');
    expect(walker.reason).toBe('closedGate');
    expect(
      store.events.some(
        (e) => e.type === 'explorerBlocked' && e.reason === 'closedGate'
      )
    ).toBe(true);

    store.gateOpened('p3');
    tick(4);
    expect(walker.reason).not.toBe('closedGate');
  });

  it('stops at an awake slime and resumes on slimeStunned', () => {
    const plan: LevelPlan = {
      ...PLAN,
      placements: [
        ...PLAN.placements,
        {
          id: 'pslime',
          piece: 'slime',
          surface: 's1',
          u: 0.45,
          v: 0.45,
          playerBuilt: false,
          links: [],
        },
      ],
    };
    const { store, walker, tick } = playing(plan);
    tick(80);
    expect(walker.state).toBe('blocked');
    expect(walker.reason).toBe('awakeSlime');
    expect(
      store.events.some(
        (e) => e.type === 'explorerBlocked' && e.reason === 'awakeSlime'
      )
    ).toBe(true);

    store.slimeStunned('pslime');
    tick(4);
    expect(walker.reason).not.toBe('awakeSlime');
  });

  it('writes world position into a caller-owned out vector', () => {
    const { walker } = playing();
    const out = { x: 9, y: 9, z: 9 };
    const returned = walker.getWorldPosition(out);
    expect(returned).toBe(out);
    expect(out).toEqual({
      x: walker.pose.x,
      y: walker.pose.y,
      z: walker.pose.z,
    });
  });
});
