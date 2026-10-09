import { describe, expect, it } from 'vitest';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import type { LevelPlan, Placement } from '@roomquest/schema';
import { bfsPath, explorerAdjacency, bfsReachable } from '../validate';
import { placementToPose } from '../placement/pose';
import { explorerPath } from './explorer-path';
import type { TraversalKind } from './types';

const GRAPH = SYNTHETIC_LIVING_ROOM;
const PLAN = SYNTHETIC_LIVING_ROOM_PLAN;

function kindsOf(plan: LevelPlan = PLAN): TraversalKind[] {
  return explorerPath(plan, GRAPH).segments.map((s) => s.kind);
}

function extra(placement: Placement, plan: LevelPlan = PLAN): LevelPlan {
  return { ...plan, placements: [...plan.placements, placement] };
}

describe('explorerPath', () => {
  it('reuses the solvability BFS from start to goal', () => {
    const builtIds = new Set(
      PLAN.placements
        .filter(
          (p) =>
            p.piece === 'plank_bridge' ||
            p.piece === 'ramp' ||
            p.piece === 'portal' ||
            p.piece === 'moving_platform'
        )
        .map((p) => p.id)
    );
    const openGateIds = new Set(
      PLAN.placements.filter((p) => p.piece === 'gate').map((p) => p.id)
    );
    const adj = explorerAdjacency(PLAN, GRAPH, { builtIds, openGateIds });
    const surfaces = bfsPath(PLAN.start, PLAN.goal, adj);
    expect(surfaces).toEqual(['s1', 's2']);
    expect(bfsReachable(PLAN.start, adj).has(PLAN.goal)).toBe(true);

    const path = explorerPath(PLAN, GRAPH);
    expect(path.waypoints[0]?.surfaceId).toBe('s1');
    expect(path.waypoints[path.waypoints.length - 1]?.surfaceId).toBe('s2');
    expect(path.waypoints[0]?.placementId).toBe('p1');
    expect(path.waypoints[path.waypoints.length - 1]?.placementId).toBe('p7');
  });

  it('returns world poses via placementToPose', () => {
    const path = explorerPath(PLAN, GRAPH);
    const hut = PLAN.placements.find((p) => p.id === 'p1');
    const shrine = PLAN.placements.find((p) => p.id === 'p7');
    expect(hut).toBeDefined();
    expect(shrine).toBeDefined();
    if (!hut || !shrine) return;
    expect(path.waypoints[0]?.pose).toEqual(placementToPose(GRAPH, hut));
    expect(path.waypoints[path.waypoints.length - 1]?.pose).toEqual(
      placementToPose(GRAPH, shrine)
    );
  });

  it('tags the fixture plank as a player-built gap', () => {
    const path = explorerPath(PLAN, GRAPH);
    const plank = path.segments.find((s) => s.kind === 'plank_bridge');
    expect(plank).toBeDefined();
    expect(plank?.blocker).toBe('unbuiltGap');
    expect(plank?.placementId).toBe('p2');
  });

  it('tags the fixture gate as a closed-gate blocker', () => {
    const path = explorerPath(PLAN, GRAPH);
    const gate = path.segments.find((s) => s.kind === 'gate');
    expect(gate).toBeDefined();
    expect(gate?.blocker).toBe('closedGate');
    expect(gate?.placementId).toBe('p3');
  });

  it('visits gems on the path', () => {
    const path = explorerPath(PLAN, GRAPH);
    const ids = path.waypoints.map((w) => w.placementId);
    expect(ids).toContain('p5');
    expect(ids).toContain('p6');
  });

  it('returns an ordered walk that includes walk hops', () => {
    expect(kindsOf()).toContain('walk');
    expect(kindsOf()).toContain('plank_bridge');
    expect(kindsOf()).toContain('gate');
  });

  it('tags a ramp hop', () => {
    const plan = extra({
      id: 'pramp',
      piece: 'ramp',
      surface: 's1',
      to: 's5',
      u: 0.5,
      v: 0.9,
      playerBuilt: true,
      links: [],
    });
    const path = explorerPath({ ...plan, goal: 's5', start: 's1' }, GRAPH);
    const ramp = path.segments.find((s) => s.kind === 'ramp');
    expect(ramp).toBeDefined();
    expect(ramp?.blocker).toBe('unbuiltGap');
    expect(ramp?.placementId).toBe('pramp');
  });

  it('tags a portal hop as teleport', () => {
    const plan: LevelPlan = {
      ...PLAN,
      goal: 's3',
      placements: [
        ...PLAN.placements.filter((p) => p.id !== 'p2' && p.id !== 'p7'),
        {
          id: 'p2',
          piece: 'portal',
          surface: 's1',
          to: 's3',
          u: 0.5,
          v: 0.5,
          playerBuilt: false,
          links: [],
        },
        {
          id: 'p7',
          piece: 'crystal_shrine',
          surface: 's3',
          u: 0.5,
          v: 0.5,
          playerBuilt: false,
          links: [],
        },
      ],
      beats: [
        { goal: 'Take the portal', uses: ['p2'] },
        { goal: 'Reach the shrine', uses: ['p7'] },
      ],
    };
    const portal = explorerPath(plan, GRAPH).segments.find(
      (s) => s.kind === 'portal'
    );
    expect(portal).toBeDefined();
    expect(portal?.blocker).toBeUndefined();
    expect(portal?.placementId).toBe('p2');
  });

  it('tags a moving platform hop', () => {
    const plan: LevelPlan = {
      ...PLAN,
      goal: 's3',
      placements: [
        ...PLAN.placements.filter((p) => p.id !== 'p2' && p.id !== 'p7'),
        {
          id: 'p2',
          piece: 'moving_platform',
          surface: 's1',
          to: 's3',
          u: 0.5,
          v: 0.5,
          playerBuilt: false,
          links: [],
        },
        {
          id: 'p7',
          piece: 'crystal_shrine',
          surface: 's3',
          u: 0.5,
          v: 0.5,
          playerBuilt: false,
          links: [],
        },
      ],
      beats: [
        { goal: 'Ride the platform', uses: ['p2'] },
        { goal: 'Reach the shrine', uses: ['p7'] },
      ],
    };
    const ride = explorerPath(plan, GRAPH).segments.find(
      (s) => s.kind === 'moving_platform'
    );
    expect(ride).toBeDefined();
    expect(ride?.placementId).toBe('p2');
    expect(ride?.blocker).toBe('unalignedPlatform');
  });

  it('tags an awake slime as a blocker', () => {
    const plan = extra({
      id: 'pslime',
      piece: 'slime',
      surface: 's1',
      u: 0.4,
      v: 0.4,
      playerBuilt: false,
      links: [],
    });
    const slime = explorerPath(plan, GRAPH).segments.find(
      (s) => s.blocker === 'awakeSlime'
    );
    expect(slime).toBeDefined();
    expect(slime?.placementId).toBe('pslime');
  });

  it('returns empty when the goal is missing from the graph', () => {
    const path = explorerPath({ ...PLAN, goal: 'missing' }, GRAPH);
    expect(path.waypoints).toEqual([]);
    expect(path.segments).toEqual([]);
  });
});
