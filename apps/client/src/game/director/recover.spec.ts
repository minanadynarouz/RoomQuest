import { describe, expect, it, vi } from 'vitest';
import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import {
  generatePlan,
  snapPlacementsToSlots,
  validatePlan,
} from '@roomquest/level-core';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import { recoverPlan } from './recover.js';
import type { RepairFn, RouteRepairFn, SnapFn } from './types.js';

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
const noopRoute: RouteRepairFn = (plan) => ({
  plan,
  changed: false,
  issues: [],
  strategy: 'none',
});

/** Drop one connector (placement with `to`) and its beat uses: route-only break. */
function breakConnector(plan: LevelPlan): LevelPlan | null {
  const conn = plan.placements.find((p) => p.to !== undefined);
  if (!conn) return null;
  return {
    ...plan,
    placements: plan.placements.filter((p) => p.id !== conn.id),
    beats: plan.beats.map((b) => ({
      ...b,
      uses: b.uses.filter((u) => u !== conn.id),
    })),
  };
}

const failingRepair: RepairFn = () => ({
  ok: false,
  repairs: ['gave up'],
  relaxed: [],
  result: {
    ok: false,
    issues: [{ code: 'GOAL_UNREACHABLE', message: 'no path' }],
    relaxed: [],
  },
});

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
    const recovered = await recoverPlan(dirty, GRAPH, {
      snap: noopSnap,
      route: noopRoute,
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.repairedBy).toBe('repairPlan');
    expect(validatePlan(recovered.plan, GRAPH).ok).toBe(true);
  });

  it('fails after snap then repairPlan without using a fixture', async () => {
    const repair: RepairFn = () => ({
      ok: false,
      repairs: ['gave up'],
      relaxed: [],
      result: {
        ok: false,
        issues: [{ code: 'GOAL_UNREACHABLE', message: 'no path' }],
        relaxed: [],
      },
    });
    const recovered = await recoverPlan(
      dirtyUv(generatePlan(GRAPH, 'fail-seed', 'normal')),
      GRAPH,
      { snap: noopSnap, route: noopRoute, repair }
    );
    expect(recovered.ok).toBe(false);
    expect(recovered.repairedBy).toBeUndefined();
  });

  it('fixes a route-only break with repairRoute before repairPlan', async () => {
    const graph = IWER_GRAPHS[IWER_ROOM_IDS[0]];
    const broken = breakConnector(generatePlan(graph, 'route-seed', 'normal'));
    expect(broken).not.toBeNull();
    if (!broken) return;
    expect(validatePlan(broken, graph).ok).toBe(false);
    expect(
      validatePlan(snapPlacementsToSlots(broken, graph).plan, graph).ok
    ).toBe(false);
    const repair = vi.fn<RepairFn>(() => {
      throw new Error('repairPlan must not run when repairRoute fixed it');
    });
    const recovered = await recoverPlan(broken, graph, { repair });
    expect(recovered.ok).toBe(true);
    expect(recovered.repairedBy).toBe('repairRoute');
    expect(recovered.repairs).toContain('repairRoute: kept');
    expect(repair).not.toHaveBeenCalled();
    expect(validatePlan(recovered.plan, graph).ok).toBe(true);
  });

  it('runs repairRoute then repairPlan on the same pinned graph', async () => {
    const seen: SurfaceGraph[] = [];
    const route: RouteRepairFn = (plan, graph) => {
      seen.push(graph);
      return noopRoute(plan, graph);
    };
    const repair: RepairFn = (plan, graph) => {
      seen.push(graph);
      return failingRepair(plan, graph);
    };
    await recoverPlan(dirtyUv(generatePlan(GRAPH, 'pin', 'normal')), GRAPH, {
      snap: noopSnap,
      route,
      repair,
    });
    expect(seen).toEqual([GRAPH, GRAPH]);
    expect(seen.every((g) => g === GRAPH)).toBe(true);
  });

  it('never returns a stub when repairPlan fails on an s1/s2 graph', async () => {
    const broken = dirtyUv(generatePlan(GRAPH, 'stub-seed', 'normal'));
    const recovered = await recoverPlan(broken, GRAPH, {
      snap: noopSnap,
      route: noopRoute,
      repair: failingRepair,
    });
    expect(recovered.ok).toBe(false);
    expect(recovered.repairedBy).toBeUndefined();
    expect(recovered.plan.title).not.toBe('Unrepaired');
    expect(recovered.plan).toEqual(broken);
    expect(recovered.plan.placements.length).toBeGreaterThan(0);
  });

  it('forwards relaxed rule ids from the plan or validator', async () => {
    const plan = {
      ...generatePlan(GRAPH, 'relaxed-seed', 'normal'),
      relaxed: ['minPath'],
    } as LevelPlan & { relaxed: string[] };
    const recovered = await recoverPlan(plan, GRAPH, {
      validate: (next) => {
        const result = validatePlan(next, GRAPH);
        return { ...result, relaxed: ['portalFov'] };
      },
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.relaxed).toEqual([
      'minPath',
      'portalFov',
    ]);
  });
});
