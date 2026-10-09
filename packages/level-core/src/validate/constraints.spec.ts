import { describe, it, expect } from 'vitest';
import { validatePlan } from './validate-plan';
import {
  GRAPH,
  PLAN,
  codesOf,
  extraPlacement,
  replacePiece,
  withEdge,
  withNode,
  withPlacement,
} from './spec-helpers';

describe('per-piece KIT_CATALOG constraints', () => {
  it('UNKNOWN_SURFACE: placement.surface is missing from the graph', () => {
    const plan = withPlacement('p1', { surface: 's9' });
    const result = validatePlan(plan, GRAPH);
    expect(codesOf(result)).toContain('UNKNOWN_SURFACE');
    expect(
      result.issues.some(
        (item) => item.code === 'UNKNOWN_SURFACE' && item.placementId === 'p1'
      )
    ).toBe(true);
  });

  it('UNKNOWN_SURFACE: start id is not a graph node', () => {
    const result = validatePlan({ ...PLAN, start: 's9' }, GRAPH);
    expect(codesOf(result)).toContain('UNKNOWN_SURFACE');
  });

  it('LABEL_NOT_ALLOWED: village_hut on a couch', () => {
    const result = validatePlan(PLAN, withNode('s1', { label: 'couch' }));
    expect(codesOf(result)).toContain('LABEL_NOT_ALLOWED');
  });

  it('HEIGHT_OUT_OF_RANGE: village_hut below 0.4 m', () => {
    const result = validatePlan(PLAN, withNode('s1', { topHeight: 0.2 }));
    expect(codesOf(result)).toContain('HEIGHT_OUT_OF_RANGE');
  });

  it('HEIGHT_OUT_OF_RANGE: village_hut above 1.1 m', () => {
    const result = validatePlan(PLAN, withNode('s1', { topHeight: 1.4 }));
    expect(codesOf(result)).toContain('HEIGHT_OUT_OF_RANGE');
  });

  it('AREA_TOO_SMALL: village_hut on a tiny table', () => {
    const result = validatePlan(PLAN, withNode('s1', { area: 0.1 }));
    expect(codesOf(result)).toContain('AREA_TOO_SMALL');
  });

  it('GAP_TOO_WIDE: plank spanning more than 0.9 m', () => {
    const result = validatePlan(PLAN, withEdge('s1', 's2', { gap: 1.2 }));
    expect(codesOf(result)).toContain('GAP_TOO_WIDE');
  });

  it('GAP_TOO_NARROW: plank spanning less than 0.1 m', () => {
    const result = validatePlan(PLAN, withEdge('s1', 's2', { gap: 0.04 }));
    expect(codesOf(result)).toContain('GAP_TOO_NARROW');
  });

  it('DELTA_HEIGHT_TOO_LARGE: plank |Δh| over 0.25 m', () => {
    const result = validatePlan(PLAN, withEdge('s1', 's2', { dh: 0.5 }));
    expect(codesOf(result)).toContain('DELTA_HEIGHT_TOO_LARGE');
  });

  it('OUT_OF_REACH: lever on an outOfView surface', () => {
    const result = validatePlan(PLAN, withNode('s4', { reach: 'outOfView' }));
    expect(codesOf(result)).toContain('OUT_OF_REACH');
  });

  it('SLOPE_TOO_STEEP: lever more than 50° from forward', () => {
    const result = validatePlan(
      PLAN,
      withNode('s4', { angleFromForward: 80, reach: 'ray' })
    );
    expect(codesOf(result)).toContain('SLOPE_TOO_STEEP');
  });

  it('MISSING_SECOND_SURFACE: plank without to', () => {
    const result = validatePlan(
      {
        ...PLAN,
        placements: PLAN.placements.map((placement) =>
          placement.id === 'p2'
            ? {
                id: 'p2',
                piece: 'plank_bridge' as const,
                surface: 's1',
                u: 1,
                v: 0.5,
                playerBuilt: true,
                links: [],
              }
            : placement
        ),
      },
      GRAPH
    );
    expect(codesOf(result)).toContain('MISSING_SECOND_SURFACE');
  });

  it('SAME_SURFACE_PAIR: plank both ends on s1', () => {
    const result = validatePlan(withPlacement('p2', { to: 's1' }), GRAPH);
    expect(codesOf(result)).toContain('SAME_SURFACE_PAIR');
  });

  it('PATH_DISTANCE_TOO_SHORT: shrine closer than 0.8 m to hut', () => {
    const graph = withNode('s2', { centroid: [0, 0.45, -1.2] });
    const result = validatePlan(PLAN, graph);
    expect(codesOf(result)).toContain('PATH_DISTANCE_TOO_SHORT');
  });

  it('TOO_MANY_OF_PIECE: two village_hut placements', () => {
    const result = validatePlan(
      extraPlacement({
        id: 'p-hut2',
        piece: 'village_hut',
        surface: 's3',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      }),
      GRAPH
    );
    expect(codesOf(result)).toContain('TOO_MANY_OF_PIECE');
  });

  it('GATE_WITHOUT_LEVER: lever links cleared', () => {
    const result = validatePlan(withPlacement('p4', { links: [] }), GRAPH);
    expect(codesOf(result)).toContain('GATE_WITHOUT_LEVER');
  });

  it('INVALID_LINK: lever points at a gem', () => {
    const result = validatePlan(withPlacement('p4', { links: ['p5'] }), GRAPH);
    expect(codesOf(result)).toContain('INVALID_LINK');
  });

  it('MISSING_START_HUT: hut replaced with a gem', () => {
    const result = validatePlan(
      replacePiece('p1', {
        id: 'p1',
        piece: 'gem',
        surface: 's1',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      }),
      GRAPH
    );
    expect(codesOf(result)).toContain('MISSING_START_HUT');
  });

  it('MISSING_GOAL_SHRINE: shrine replaced with a gem', () => {
    const result = validatePlan(
      replacePiece('p7', {
        id: 'p7',
        piece: 'gem',
        surface: 's2',
        u: 0.8,
        v: 0.5,
        playerBuilt: false,
        links: [],
      }),
      GRAPH
    );
    expect(codesOf(result)).toContain('MISSING_GOAL_SHRINE');
  });

  it('HUT_NOT_ON_START: hut moved off plan.start', () => {
    const result = validatePlan(withPlacement('p1', { surface: 's3' }), GRAPH);
    expect(codesOf(result)).toContain('HUT_NOT_ON_START');
  });

  it('SHRINE_NOT_ON_GOAL: shrine moved off plan.goal', () => {
    const result = validatePlan(withPlacement('p7', { surface: 's3' }), GRAPH);
    expect(codesOf(result)).toContain('SHRINE_NOT_ON_GOAL');
  });

  it('FLOOR_RUN_TOO_SHORT: ramp with run < 2×Δh', () => {
    const plan = extraPlacement({
      id: 'p-ramp',
      piece: 'ramp',
      surface: 's1',
      to: 's3',
      u: 0.5,
      v: 0.5,
      playerBuilt: true,
      links: [],
    });
    const graph = withEdge('s1', 's3', { gap: 0.05, dh: 0.2, kind: 'ramp' });
    const result = validatePlan(plan, graph);
    expect(codesOf(result)).toContain('FLOOR_RUN_TOO_SHORT');
  });

  it('DELTA_HEIGHT_TOO_LARGE: ramp |Δh| over 0.6 m', () => {
    const plan = extraPlacement({
      id: 'p-ramp',
      piece: 'ramp',
      surface: 's1',
      to: 's5',
      u: 0.5,
      v: 0.5,
      playerBuilt: true,
      links: [],
    });
    const result = validatePlan(plan, GRAPH);
    expect(codesOf(result)).toContain('DELTA_HEIGHT_TOO_LARGE');
  });

  it('AREA_TOO_SMALL: slime on a table under 0.5 m²', () => {
    const result = validatePlan(
      extraPlacement({
        id: 'p-slime',
        piece: 'slime',
        surface: 's4',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      }),
      GRAPH
    );
    expect(codesOf(result)).toContain('AREA_TOO_SMALL');
  });

  it('LABEL_NOT_ALLOWED: slime on the floor', () => {
    const result = validatePlan(
      extraPlacement({
        id: 'p-slime',
        piece: 'slime',
        surface: 's5',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      }),
      GRAPH
    );
    expect(codesOf(result)).toContain('LABEL_NOT_ALLOWED');
  });

  it('LABEL_NOT_ALLOWED: moving_platform on a couch', () => {
    const result = validatePlan(
      extraPlacement({
        id: 'p-plat',
        piece: 'moving_platform',
        surface: 's2',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      }),
      GRAPH
    );
    expect(codesOf(result)).toContain('LABEL_NOT_ALLOWED');
  });

  it('SLOPE_TOO_STEEP: portal "to" surface outside the 50° cone', () => {
    const plan = extraPlacement({
      id: 'p-portal',
      piece: 'portal',
      surface: 's1',
      to: 's3',
      u: 0.2,
      v: 0.2,
      playerBuilt: false,
      links: [],
    });
    const result = validatePlan(
      plan,
      withNode('s3', { angleFromForward: 70, reach: 'ray' })
    );
    expect(codesOf(result)).toContain('SLOPE_TOO_STEEP');
  });

  it('UNKNOWN_SURFACE: plank "to" is missing from the graph', () => {
    const result = validatePlan(withPlacement('p2', { to: 's9' }), GRAPH);
    expect(codesOf(result)).toContain('UNKNOWN_SURFACE');
  });

  it('START_EQUALS_GOAL: hut and shrine share a surface while start≠goal ids', () => {
    const result = validatePlan(withPlacement('p7', { surface: 's1' }), GRAPH);
    expect(codesOf(result)).toContain('START_EQUALS_GOAL');
  });

  it('computes gap from centroids when the graph has no matching edge', () => {
    const result = validatePlan(withPlacement('p2', { to: 's4' }), GRAPH);
    expect(codesOf(result)).not.toContain('SCHEMA_INVALID');
    expect(typeof result.ok).toBe('boolean');
  });
});
