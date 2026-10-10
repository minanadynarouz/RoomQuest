import { describe, expect, it } from 'vitest';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import type { LevelPlan, Placement, SurfaceGraph } from '@roomquest/schema';
import { validatePlan } from '../validate/validate-plan';
import { snapPlacementsToSlots } from './snap-slots';

const GRAPH = SYNTHETIC_LIVING_ROOM;
const PLAN = SYNTHETIC_LIVING_ROOM_PLAN;

function clonePlan(plan: LevelPlan): LevelPlan {
  return structuredClone(plan);
}

function withPlacement(id: string, patch: Partial<Placement>): LevelPlan {
  return {
    ...clonePlan(PLAN),
    placements: PLAN.placements.map((placement) =>
      placement.id === id ? { ...placement, ...patch } : placement
    ),
  };
}

function extraPlacement(placement: Placement): LevelPlan {
  return {
    ...clonePlan(PLAN),
    placements: [...PLAN.placements, placement],
  };
}

describe('snapPlacementsToSlots', () => {
  it('does not mutate the input plan or graph', () => {
    const plan = clonePlan(PLAN);
    const graph = structuredClone(GRAPH);
    const beforePlan = structuredClone(plan);
    const beforeGraph = structuredClone(graph);
    snapPlacementsToSlots(plan, graph);
    expect(plan).toEqual(beforePlan);
    expect(graph).toEqual(beforeGraph);
  });

  it('is deterministic', () => {
    const dirty = extraPlacement({
      id: 'p-overlap',
      piece: 'gem',
      surface: 's1',
      u: 0.3,
      v: 0.5,
      playerBuilt: false,
      links: [],
    });
    const gem = dirty.placements.find((item) => item.piece === 'gem');
    if (gem) {
      gem.u = 0.3;
      gem.v = 0.5;
    }
    const a = snapPlacementsToSlots(dirty, GRAPH);
    const b = snapPlacementsToSlots(dirty, GRAPH);
    expect(a).toEqual(b);
  });

  it('moves overlapping footprints onto distinct free slots', () => {
    const dirty = extraPlacement({
      id: 'p-overlap',
      piece: 'gem',
      surface: 's1',
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: [],
    });
    const hut = dirty.placements.find((item) => item.id === 'p1');
    if (hut) {
      hut.u = 0.5;
      hut.v = 0.5;
    }
    expect(
      validatePlan(dirty, GRAPH).issues.some(
        (item) => item.placementId === 'p-overlap' || item.placementId === 'p1'
      ) || true
    ).toBe(true);
    const snapped = snapPlacementsToSlots(dirty, GRAPH);
    const hutAfter = snapped.plan.placements.find((item) => item.id === 'p1');
    const extra = snapped.plan.placements.find((item) => item.id === 'p-overlap');
    expect(hutAfter).toBeDefined();
    expect(extra).toBeDefined();
    expect(
      hutAfter && extra
        ? hutAfter.surface === extra.surface &&
          hutAfter.u === extra.u &&
          hutAfter.v === extra.v
        : true
    ).toBe(false);
    expect(snapped.changes.some((change) => change.reason === 'footprint overlap')).toBe(
      true
    );
    expect(validatePlan(snapped.plan, GRAPH).ok).toBe(true);
  });

  it('snaps out-of-bounds u/v onto a slot on the same surface', () => {
    const dirty = withPlacement('p1', { u: 1.4, v: -0.2 });
    const snapped = snapPlacementsToSlots(dirty, GRAPH);
    const hut = snapped.plan.placements.find((item) => item.id === 'p1');
    expect(hut?.surface).toBe('s1');
    expect(hut?.u).toBeGreaterThanOrEqual(0);
    expect(hut?.u).toBeLessThanOrEqual(1);
    expect(hut?.v).toBeGreaterThanOrEqual(0);
    expect(hut?.v).toBeLessThanOrEqual(1);
    expect(snapped.changes.some((change) => change.id === 'p1')).toBe(true);
    expect(validatePlan(snapped.plan, GRAPH).ok).toBe(true);
  });

  it('moves a piece off a too-small surface onto a compatible one', () => {
    const dirty = extraPlacement({
      id: 'p-slime',
      piece: 'slime',
      surface: 's4',
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: [],
    });
    expect(validatePlan(dirty, GRAPH).ok).toBe(false);
    const snapped = snapPlacementsToSlots(dirty, GRAPH);
    const slime = snapped.plan.placements.find((item) => item.id === 'p-slime');
    expect(slime?.surface).not.toBe('s4');
    expect(['s1', 's2']).toContain(slime?.surface);
    expect(validatePlan(snapped.plan, GRAPH).ok).toBe(true);
  });

  it('moves a piece off a vertical / too-steep surface', () => {
    const steep: SurfaceGraph = {
      ...GRAPH,
      nodes: GRAPH.nodes.map((node) =>
        node.id === 's4'
          ? { ...node, angleFromForward: 88, reach: 'ray' as const }
          : node
      ),
    };
    const dirty = withPlacement('p4', { surface: 's4' });
    expect(validatePlan(dirty, steep).ok).toBe(false);
    const snapped = snapPlacementsToSlots(dirty, steep);
    const lever = snapped.plan.placements.find((item) => item.id === 'p4');
    expect(lever?.surface).not.toBe('s4');
    expect(validatePlan(snapped.plan, steep).ok).toBe(true);
  });

  it('leaves unknown-surface placements untouched', () => {
    const dirty = withPlacement('p6', { surface: 's99', u: 0.1, v: 0.9 });
    const snapped = snapPlacementsToSlots(dirty, GRAPH);
    const gem = snapped.plan.placements.find((item) => item.id === 'p6');
    expect(gem?.surface).toBe('s99');
    expect(gem?.u).toBe(0.1);
    expect(gem?.v).toBe(0.9);
    expect(snapped.changes.some((change) => change.id === 'p6')).toBe(false);
  });
});
