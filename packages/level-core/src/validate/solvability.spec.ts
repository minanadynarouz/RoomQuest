import { describe, it, expect } from 'vitest';
import { validatePlan } from './validate-plan';
import {
  GRAPH,
  PLAN,
  codesOf,
  extraPlacement,
  replacePiece,
  withNode,
  withPlacement,
} from './spec-helpers';

describe('BFS solvability', () => {
  it('START_EQUALS_GOAL: start and goal share a surface id', () => {
    const result = validatePlan({ ...PLAN, goal: 's1' }, GRAPH);
    expect(codesOf(result)).toContain('START_EQUALS_GOAL');
  });

  it('GOAL_UNREACHABLE: no built link from start', () => {
    const plan = replacePiece('p2', {
      id: 'p2',
      piece: 'gem',
      surface: 's1',
      u: 0.8,
      v: 0.5,
      playerBuilt: false,
      links: [],
    });
    const result = validatePlan(
      {
        ...plan,
        beats: [
          { goal: 'Collect a gem', uses: ['p5'] },
          { goal: 'Reach the shrine', uses: ['p7'] },
        ],
      },
      GRAPH
    );
    expect(codesOf(result)).toContain('GOAL_UNREACHABLE');
  });

  it('GOAL_UNREACHABLE: gate stays closed when lever is out of reach', () => {
    const result = validatePlan(
      PLAN,
      withNode('s4', { reach: 'outOfView', angleFromForward: 40 })
    );
    expect(codesOf(result)).toContain('GOAL_UNREACHABLE');
  });

  it('BEAT_NOT_COMPLETABLE: shrine beat before the bridge is built', () => {
    const result = validatePlan(
      {
        ...PLAN,
        beats: [
          { goal: 'Reach the crystal shrine', uses: ['p7'] },
          { goal: 'Bridge the gap', uses: ['p2'] },
        ],
      },
      GRAPH
    );
    expect(codesOf(result)).toContain('BEAT_NOT_COMPLETABLE');
  });

  it('BEAT_NOT_COMPLETABLE: lever used while out of reach', () => {
    const result = validatePlan(PLAN, withNode('s4', { reach: 'outOfView' }));
    expect(codesOf(result)).toContain('BEAT_NOT_COMPLETABLE');
  });

  it('UNKNOWN_PLACEMENT_REF: beat.uses names a missing id', () => {
    const result = validatePlan(
      {
        ...PLAN,
        beats: [
          ...PLAN.beats.slice(0, 1),
          { goal: 'Do a mystery thing', uses: ['p999'] },
        ],
      },
      GRAPH
    );
    expect(codesOf(result)).toContain('UNKNOWN_PLACEMENT_REF');
  });

  it('UNKNOWN_PLACEMENT_REF: lever.links names a missing id', () => {
    const result = validatePlan(
      withPlacement('p4', { links: ['p999'] }),
      GRAPH
    );
    expect(codesOf(result)).toContain('UNKNOWN_PLACEMENT_REF');
  });

  it('NOT_ON_PATH: gem sits on a surface off the start→goal walk', () => {
    const result = validatePlan(withPlacement('p5', { surface: 's3' }), GRAPH);
    expect(codesOf(result)).toContain('NOT_ON_PATH');
  });

  it('DUPLICATE_PLACEMENT_ID: two placements share p1', () => {
    const result = validatePlan(
      extraPlacement({
        id: 'p1',
        piece: 'gem',
        surface: 's1',
        u: 0.1,
        v: 0.1,
        playerBuilt: false,
        links: [],
      }),
      GRAPH
    );
    expect(codesOf(result)).toContain('DUPLICATE_PLACEMENT_ID');
  });

  it('opens an edge-gate (gate.to set) when the lever is reachable', () => {
    const plan = withPlacement('p3', { to: 's1' });
    const result = validatePlan(plan, GRAPH);
    expect(result.ok).toBe(true);
  });

  it('GOAL_UNREACHABLE: edge-gate stays closed without a reachable lever', () => {
    const plan = {
      ...withPlacement('p3', { to: 's1' }),
      placements: withPlacement('p3', { to: 's1' }).placements.map((p) =>
        p.id === 'p4' ? { ...p, links: [] } : p
      ),
    };
    const result = validatePlan(plan, GRAPH);
    expect(codesOf(result)).toContain('GOAL_UNREACHABLE');
  });

  it('a non-player-built ramp is walkable from the first beat', () => {
    const plan = {
      ...PLAN,
      placements: [
        ...PLAN.placements.filter((p) => p.id !== 'p2'),
        {
          id: 'p2',
          piece: 'ramp' as const,
          surface: 's1',
          to: 's5',
          u: 0.5,
          v: 0.5,
          playerBuilt: false,
          links: [],
        },
      ],
      beats: [
        { goal: 'Walk the ramp', uses: ['p2'] },
        { goal: 'Open the gate', uses: ['p4', 'p3'] },
        { goal: 'Reach the shrine', uses: ['p7'] },
      ],
    };
    const graph = {
      ...GRAPH,
      nodes: GRAPH.nodes.map((n) =>
        n.id === 's1' ? { ...n, topHeight: 0.5 } : n
      ),
      edges: GRAPH.edges.map((e) =>
        e.a === 's1' && e.b === 's5' ? { ...e, dh: -0.5 } : e
      ),
    };
    const result = validatePlan(plan, graph);
    expect(codesOf(result)).not.toContain('GOAL_UNREACHABLE');
  });
});
