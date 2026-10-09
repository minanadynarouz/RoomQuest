import { describe, expect, it } from 'vitest';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
  SYNTHETIC_PLATFORM_PORTAL_PLAN,
} from '@roomquest/fixtures';
import { explorerPath } from '@roomquest/level-core';
import type { LevelPlan } from '@roomquest/schema';
import { createGameStore } from '../../game/index.js';
import { pullLever } from '../lever/activate.js';
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

  it('unblocks the gate when the lever is pulled via the shared path', () => {
    const { store, walker, tick } = playing();
    store.pieceBuilt('p2');
    tick(120);
    expect(walker.reason).toBe('closedGate');
    pullLever(store, PLAN, 'p4');
    tick(4);
    expect(
      store.events.some(
        (e) => e.type === 'leverPulled' && e.placementId === 'p4'
      )
    ).toBe(true);
    expect(
      store.events.some(
        (e) => e.type === 'gateOpened' && e.placementId === 'p3'
      )
    ).toBe(true);
    expect(walker.reason).not.toBe('closedGate');
  });

  it('keeps a closed-gate block across F-07 pause/resume', () => {
    const { store, walker, tick } = playing();
    store.pieceBuilt('p2');
    tick(120);
    expect(walker.reason).toBe('closedGate');
    const pose = { x: walker.pose.x, z: walker.pose.z };
    store.pause();
    tick(40);
    expect(store.phase).toBe('paused');
    expect(walker.reason).toBe('closedGate');
    expect(walker.pose.x).toBe(pose.x);
    expect(walker.pose.z).toBe(pose.z);
    store.resume();
    tick(4);
    expect(store.phase).toBe('playing');
    expect(walker.reason).toBe('closedGate');
    pullLever(store, PLAN, 'p4');
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

  it('freezes movement while the store is paused', () => {
    const { store, walker, tick } = playing();
    store.pieceBuilt('p2');
    tick(20);
    const x = walker.pose.x;
    const z = walker.pose.z;
    const state = walker.state;
    expect(state === 'walking' || state === 'blocked').toBe(true);
    store.pause();
    tick(40);
    expect(walker.pose.x).toBe(x);
    expect(walker.pose.z).toBe(z);
    store.resume();
    tick(40);
    const moved = walker.pose.x !== x || walker.pose.z !== z;
    const celebrated = walker.state === 'celebrating' || store.phase === 'won';
    expect(moved || celebrated || walker.state === 'blocked').toBe(true);
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

  it('stops at an unaligned platform and rides after platformAligned', () => {
    const { store, walker, tick } = playing(SYNTHETIC_PLATFORM_PORTAL_PLAN);
    tick(80);
    expect(walker.state).toBe('blocked');
    expect(walker.reason).toBe('unalignedPlatform');
    expect(
      store.events.some(
        (e) => e.type === 'explorerBlocked' && e.reason === 'unalignedPlatform'
      )
    ).toBe(true);

    store.platformAligned('p2');
    tick(8);
    expect(walker.reason).not.toBe('unalignedPlatform');
    expect(walker.state).toBe('riding');
  });

  it('teleports through the portal pair and emits portalUsed', () => {
    const { store, walker, tick } = playing(SYNTHETIC_PLATFORM_PORTAL_PLAN);
    store.platformAligned('p2');
    tick(120);
    expect(
      store.events.some((e) => e.type === 'portalUsed' && e.placementId === 'p3')
    ).toBe(true);
    expect(['teleporting', 'walking', 'celebrating', 'idle']).toContain(
      walker.state
    );
  });
});
