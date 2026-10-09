import { describe, it, expect } from 'vitest';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { PAR_TIME_MAX_MS, PAR_TIME_MIN_MS } from '@roomquest/schema';
import type { LevelPlan } from '@roomquest/schema';
import { validatePlan } from '../validate/validate-plan';
import { repairPlan } from './repair-plan';

const GRAPH = SYNTHETIC_LIVING_ROOM;
const PLAN = SYNTHETIC_LIVING_ROOM_PLAN;

function clonePlan(plan: LevelPlan): LevelPlan {
  return structuredClone(plan);
}

describe('repairPlan', () => {
  it('leaves a valid plan unchanged besides a re-validation', () => {
    const result = repairPlan(clonePlan(PLAN), GRAPH);
    expect(result.result.ok).toBe(true);
    expect(result.repairs).toEqual([]);
    expect(result.plan.start).toBe(PLAN.start);
    expect(result.plan.goal).toBe(PLAN.goal);
    expect(result.plan.placements).toHaveLength(PLAN.placements.length);
  });

  it('clamps u/v into 0..1', () => {
    const dirty = clonePlan(PLAN);
    const first = dirty.placements[0];
    expect(first).toBeDefined();
    if (!first) {
      return;
    }
    first.u = 1.4;
    first.v = -0.2;
    const result = repairPlan(dirty, GRAPH);
    expect(result.repairs.some((line) => line.includes('clamped u/v'))).toBe(
      true
    );
    const repaired = result.plan.placements.find((p) => p.id === first.id);
    expect(repaired?.u).toBe(1);
    expect(repaired?.v).toBe(0);
    expect(result.result.ok).toBe(true);
  });

  it('drops an invalid piece (slime on the floor)', () => {
    const dirty = clonePlan(PLAN);
    dirty.placements.push({
      id: 'p-slime',
      piece: 'slime',
      surface: 's5',
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: [],
    });
    expect(validatePlan(dirty, GRAPH).ok).toBe(false);
    const result = repairPlan(dirty, GRAPH);
    expect(
      result.repairs.some((line) => line.includes('dropped invalid slime'))
    ).toBe(true);
    expect(
      result.plan.placements.some((p) => p.id === 'p-slime')
    ).toBe(false);
    expect(result.result.ok).toBe(true);
  });

  it('inserts a plank where a gap fits after the original bridge is removed', () => {
    const dirty = clonePlan(PLAN);
    dirty.placements = dirty.placements.filter((p) => p.piece !== 'plank_bridge');
    dirty.beats = dirty.beats.map((beat) => ({
      ...beat,
      uses: beat.uses.filter((id) => id !== 'p2'),
    }));
    expect(validatePlan(dirty, GRAPH).issues.map((i) => i.code)).toContain(
      'GOAL_UNREACHABLE'
    );
    const result = repairPlan(dirty, GRAPH);
    expect(
      result.repairs.some((line) => line.startsWith('inserted plank_bridge'))
    ).toBe(true);
    expect(
      result.plan.placements.some((p) => p.piece === 'plank_bridge')
    ).toBe(true);
    expect(result.result.ok).toBe(true);
  });

  it('clamps parTimeMs via clampParTimeMs', () => {
    const dirty = clonePlan(PLAN);
    dirty.parTimeMs = 12;
    const result = repairPlan(dirty, GRAPH);
    expect(
      result.repairs.some((line) => line.includes('clamped parTimeMs'))
    ).toBe(true);
    expect(result.plan.parTimeMs).toBe(PAR_TIME_MIN_MS);
    expect(result.result.ok).toBe(true);

    const high = clonePlan(PLAN);
    high.parTimeMs = 999999;
    const highResult = repairPlan(high, GRAPH);
    expect(highResult.plan.parTimeMs).toBe(PAR_TIME_MAX_MS);
    expect(highResult.result.ok).toBe(true);
  });

  it('returns result.ok false for a plan that repair cannot save', () => {
    const hopeless: LevelPlan = {
      seed: 'x',
      theme: 'sky',
      title: 'Broken',
      start: 's1',
      goal: 's1',
      placements: [
        {
          id: 'p1',
          piece: 'gem',
          surface: 's1',
          u: 0.5,
          v: 0.5,
          playerBuilt: false,
          links: [],
        },
        {
          id: 'p2',
          piece: 'gem',
          surface: 's1',
          u: 0.2,
          v: 0.2,
          playerBuilt: false,
          links: [],
        },
        {
          id: 'p3',
          piece: 'gem',
          surface: 's1',
          u: 0.3,
          v: 0.3,
          playerBuilt: false,
          links: [],
        },
        {
          id: 'p4',
          piece: 'gem',
          surface: 's1',
          u: 0.4,
          v: 0.4,
          playerBuilt: false,
          links: [],
        },
      ],
      beats: [
        { goal: 'No hut', uses: ['p1'] },
        { goal: 'No shrine', uses: ['p2'] },
      ],
      dialogue: [],
      parTimeMs: PAR_TIME_MIN_MS,
    };
    const result = repairPlan(hopeless, GRAPH);
    expect(result.result.ok).toBe(false);
    expect(result.result.issues.length).toBeGreaterThan(0);
  });

  it('drops a second village_hut as extra', () => {
    const dirty = clonePlan(PLAN);
    dirty.placements.push({
      id: 'p-hut2',
      piece: 'village_hut',
      surface: 's3',
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: [],
    });
    const result = repairPlan(dirty, GRAPH);
    expect(
      result.repairs.some((line) => line.includes('dropped extra village_hut'))
    ).toBe(true);
    expect(result.plan.placements.filter((p) => p.piece === 'village_hut')).toHaveLength(
      1
    );
    expect(result.result.ok).toBe(true);
  });

  it('drops unparseable placements from a loosely shaped plan', () => {
    const dirty = {
      ...clonePlan(PLAN),
      placements: [
        ...PLAN.placements,
        { nope: true },
        'bad',
        { id: 'p-x', piece: 'not_a_piece', surface: 's1', u: 0.5, v: 0.5 },
      ],
    };
    const result = repairPlan(dirty as unknown as LevelPlan, GRAPH);
    expect(result.repairs.length).toBeGreaterThan(0);
    expect(result.plan.placements.every((p) => p.id !== 'p-x')).toBe(true);
  });

  it('clamps non-finite u/v to 0.5', () => {
    const dirty = clonePlan(PLAN);
    const first = dirty.placements[0];
    expect(first).toBeDefined();
    if (!first) {
      return;
    }
    first.u = Number.NaN;
    first.v = Number.POSITIVE_INFINITY;
    const result = repairPlan(dirty, GRAPH);
    const repaired = result.plan.placements.find((p) => p.id === first.id);
    expect(repaired?.u).toBe(0.5);
    expect(repaired?.v).toBe(0.5);
  });

  it('drops a gem to make room before inserting a plank at 14 placements', () => {
    const dirty = clonePlan(PLAN);
    dirty.placements = dirty.placements.filter((p) => p.piece !== 'plank_bridge');
    dirty.beats = [
      { goal: 'A', uses: [] },
      { goal: 'B', uses: ['p4', 'p3'] },
      { goal: 'C', uses: ['p7'] },
      { goal: 'D', uses: ['p5'] },
    ];
    let n = 0;
    while (dirty.placements.length < 14) {
      n += 1;
      dirty.placements.push({
        id: `p-fill-${String(n)}`,
        piece: 'gem',
        surface: 's1',
        u: 0.1,
        v: 0.1,
        playerBuilt: false,
        links: [],
      });
    }
    expect(dirty.placements).toHaveLength(14);
    const result = repairPlan(dirty, GRAPH);
    expect(
      result.repairs.some((line) => line.includes('to make room for a plank'))
    ).toBe(true);
    expect(
      result.plan.placements.some((p) => p.piece === 'plank_bridge')
    ).toBe(true);
  });

  it('never throws on garbage input', () => {
    expect(() =>
      repairPlan(null as unknown as LevelPlan, GRAPH)
    ).not.toThrow();
    expect(() =>
      repairPlan(PLAN, null as unknown as typeof GRAPH)
    ).not.toThrow();
    expect(() =>
      repairPlan(
        undefined as unknown as LevelPlan,
        {} as unknown as typeof GRAPH
      )
    ).not.toThrow();
    const fromNull = repairPlan(null as unknown as LevelPlan, GRAPH);
    expect(fromNull.plan).toBeDefined();
    expect(Array.isArray(fromNull.repairs)).toBe(true);
    expect(fromNull.repairs.length).toBeGreaterThan(0);
  });
});
