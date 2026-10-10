import { describe, expect, it } from 'vitest';
import { generatePlan, validatePlan } from '@roomquest/level-core';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import { recoverPlan } from './recover.js';
import type { RepairFn, SnapFn } from './types.js';

const GRAPH: SurfaceGraph = {
  version: 1,
  roomHash: 'f1a2b3c4d5e6',
  mode: 'scene',
  floorY: 0,
  nodes: [
    {
      id: 's1',
      label: 'table',
      kind: 'plane',
      topHeight: 0.75,
      centroid: [0, 0.75, -1],
      size: [1, 0.6],
      yaw: 0,
      area: 0.6,
      reach: 'hand',
      angleFromForward: 0,
    },
    {
      id: 's2',
      label: 'couch',
      kind: 'mesh',
      topHeight: 0.45,
      centroid: [0, 0.45, -2.5],
      size: [2, 0.9],
      yaw: 0,
      area: 1.8,
      reach: 'ray',
      angleFromForward: 25,
    },
    {
      id: 's5',
      label: 'floor',
      kind: 'plane',
      topHeight: 0,
      centroid: [0, 0, -1],
      size: [4, 3],
      yaw: 0,
      area: 12,
      reach: 'hand',
      angleFromForward: 0,
    },
  ],
  edges: [
    { a: 's1', b: 's2', gap: 0.6, dh: -0.3, kind: 'plank' },
    { a: 's1', b: 's5', gap: 0, dh: -0.75, kind: 'ramp' },
    { a: 's2', b: 's5', gap: 0, dh: -0.45, kind: 'adjacent' },
  ],
};

function dirtyUv(plan: LevelPlan): LevelPlan {
  return {
    ...plan,
    placements: plan.placements.map((item, index) =>
      index === 0 ? { ...item, u: 1.4, v: -0.2 } : item
    ),
  };
}

const noopSnap: SnapFn = (plan) => ({ plan, changes: [] });

describe('recoverPlan', () => {
  it('returns the plan unchanged when the first validate passes', async () => {
    const plan = generatePlan(GRAPH, 'ok-seed', 'normal');
    const recovered = await recoverPlan(plan, GRAPH);
    expect(recovered.ok).toBe(true);
    expect(recovered.repairedBy).toBeUndefined();
    expect(recovered.plan).toEqual(plan);
    expect(validatePlan(recovered.plan, GRAPH).ok).toBe(true);
  });

  it('records repairedBy snap when slot snap makes the plan valid', async () => {
    const dirty = dirtyUv(generatePlan(GRAPH, 'snap-seed', 'normal'));
    expect(validatePlan(dirty, GRAPH).ok).toBe(false);
    const recovered = await recoverPlan(dirty, GRAPH);
    expect(recovered.ok).toBe(true);
    expect(recovered.repairedBy).toBe('snap');
    expect(recovered.repairs.some((line) => line.startsWith('snap '))).toBe(
      true
    );
    expect(validatePlan(recovered.plan, GRAPH).ok).toBe(true);
  });

  it('records repairedBy repairPlan when snap is a no-op', async () => {
    const dirty = dirtyUv(generatePlan(GRAPH, 'repair-seed', 'normal'));
    const recovered = await recoverPlan(dirty, GRAPH, { snap: noopSnap });
    expect(recovered.ok).toBe(true);
    expect(recovered.repairedBy).toBe('repairPlan');
    expect(validatePlan(recovered.plan, GRAPH).ok).toBe(true);
  });

  it('fails after snap then repairPlan without using a fixture', async () => {
    const repair: RepairFn = (plan) => ({
      plan,
      repairs: ['gave up'],
      result: {
        ok: false,
        issues: [{ code: 'GOAL_UNREACHABLE', message: 'no path' }],
      },
    });
    const recovered = await recoverPlan(
      dirtyUv(generatePlan(GRAPH, 'fail-seed', 'normal')),
      GRAPH,
      { snap: noopSnap, repair }
    );
    expect(recovered.ok).toBe(false);
    expect(recovered.repairedBy).toBeUndefined();
  });

  it('forwards relaxed rule ids from the plan or validator', async () => {
    const plan = {
      ...generatePlan(GRAPH, 'relaxed-seed', 'normal'),
      relaxed: ['PATH_DISTANCE_TOO_SHORT'],
    } as LevelPlan & { relaxed: string[] };
    const recovered = await recoverPlan(plan, GRAPH, {
      validate: (next) => {
        const result = validatePlan(next, GRAPH);
        return { ...result, relaxed: ['SLOPE_TOO_STEEP'] };
      },
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.relaxed).toEqual([
      'PATH_DISTANCE_TOO_SHORT',
      'SLOPE_TOO_STEEP',
    ]);
  });
});
