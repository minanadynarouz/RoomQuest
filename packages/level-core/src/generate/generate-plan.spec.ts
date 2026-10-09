import { describe, it, expect, vi } from 'vitest';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import {
  PIECE_IDS,
  type LevelPlan,
  type SurfaceGraph,
  type Theme,
  type Tier,
} from '@roomquest/schema';
import { validatePlan } from '../validate/validate-plan';
import { generatePlan } from './generate-plan';
import { EXTRA_TEST_GRAPHS } from './test-graphs';
import { createRng, hashString, mulberry32 } from './prng';

const ROOMS: { name: string; graph: SurfaceGraph }[] = [
  { name: 'synthetic_living_room', graph: SYNTHETIC_LIVING_ROOM },
  ...EXTRA_TEST_GRAPHS,
];

const TIERS: readonly Tier[] = ['easy', 'normal'];
const SEED_COUNT = 50;

describe('seeded PRNG', () => {
  it('hashes the same string to the same 32-bit value', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });

  it('mulberry32 is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 20; i += 1) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('createRng is deterministic for a seed string', () => {
    const a = createRng('room|easy');
    const b = createRng('room|easy');
    expect(a.next()).toBe(b.next());
    expect(a.nextInt(10)).toBe(b.nextInt(10));
    expect(a.pick(['x', 'y', 'z'], 'x')).toBe(b.pick(['x', 'y', 'z'], 'x'));
    expect(a.nextInt(0)).toBe(0);
    expect(a.nextInt(1)).toBe(0);
    expect(a.pick([], 'fallback')).toBe('fallback');
  });
});

describe('generatePlan', () => {
  it('is deterministic for the same (graph, seed, tier)', () => {
    const a = generatePlan(SYNTHETIC_LIVING_ROOM, 'f1a2b3c4d5e6-2026-10-14', 'easy');
    const b = generatePlan(SYNTHETIC_LIVING_ROOM, 'f1a2b3c4d5e6-2026-10-14', 'easy');
    expect(a).toEqual(b);
  });

  it('varies with a different seed', () => {
    const a = generatePlan(SYNTHETIC_LIVING_ROOM, 'seed-alpha', 'normal');
    const b = generatePlan(SYNTHETIC_LIVING_ROOM, 'seed-beta', 'normal');
    expect(a).not.toEqual(b);
  });

  it('does not call Math.random or Date.now', () => {
    const random = vi.spyOn(Math, 'random');
    const now = vi.spyOn(Date, 'now');
    generatePlan(SYNTHETIC_LIVING_ROOM, 'no-rand', 'easy');
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    random.mockRestore();
    now.mockRestore();
  });

  it('uses only the 10 MVP pieces and a legal theme', () => {
    const plan = generatePlan(SYNTHETIC_LIVING_ROOM, 'kit-check', 'normal');
    for (const placement of plan.placements) {
      expect(PIECE_IDS).toContain(placement.piece);
    }
    expect(['forest', 'desert', 'snow', 'sky']).toContain(plan.theme);
    expect(plan.seed).toBe('kit-check');
  });

  it('skips recentThemes when the optional param is provided', () => {
    const recent: Theme[] = ['forest', 'desert', 'snow'];
    const plan = generatePlan(
      SYNTHETIC_LIVING_ROOM,
      'theme-lock',
      'easy',
      { recentThemes: recent }
    );
    expect(plan.theme).toBe('sky');
  });

  it('handles a 2-node graph without throwing and yields a valid plan', () => {
    const tiny = EXTRA_TEST_GRAPHS.find((r) => r.name === 'tiny_two_tables');
    expect(tiny).toBeDefined();
    if (!tiny) {
      return;
    }
    const plan = generatePlan(tiny.graph, 'tiny-seed', 'easy');
    const result = validatePlan(plan, tiny.graph);
    expect(result.ok).toBe(true);
    expect(plan.start).not.toBe(plan.goal);
    expect(plan.placements.length).toBeGreaterThanOrEqual(4);
  });

  it('never throws on a degenerate graph', () => {
    expect(() =>
      generatePlan({} as unknown as SurfaceGraph, 'x', 'easy')
    ).not.toThrow();
    const stub = generatePlan(
      { nodes: [] } as unknown as SurfaceGraph,
      'empty',
      'easy'
    );
    expect(stub.placements.length).toBeGreaterThanOrEqual(4);
    expect(stub.seed).toBe('empty');
  });

  it('still builds a plan when no surface is a legal hut', () => {
    const graph: SurfaceGraph = {
      version: 1,
      roomHash: 'eeeeeeeeeeee',
      mode: 'scene',
      floorY: 0,
      nodes: [
        {
          id: 's1',
          label: 'couch',
          kind: 'mesh',
          topHeight: 0.45,
          centroid: [0, 0.45, 0],
          size: [2, 1],
          yaw: 0,
          area: 2,
          reach: 'hand',
          angleFromForward: 0,
        },
        {
          id: 's2',
          label: 'bed',
          kind: 'mesh',
          topHeight: 0.5,
          centroid: [0, 0.5, -2],
          size: [2, 1.4],
          yaw: 0,
          area: 2.8,
          reach: 'ray',
          angleFromForward: 20,
        },
      ],
      edges: [{ a: 's1', b: 's2', gap: 0.4, dh: 0.05, kind: 'plank' }],
    };
    const plan = generatePlan(graph, 'no-hut', 'easy');
    expect(plan.placements.length).toBeGreaterThanOrEqual(4);
    expect(plan.start).not.toBe(plan.goal);
  });

  it('5 rooms × 50 seeds × 2 tiers are 100% valid and solvable', () => {
    expect(ROOMS).toHaveLength(5);
    const failures: string[] = [];
    let checked = 0;
    const livingThemes = new Set<string>();

    for (const room of ROOMS) {
      for (const tier of TIERS) {
        for (let i = 0; i < SEED_COUNT; i += 1) {
          const seed = `${room.graph.roomHash}-2026-10-${String(10 + (i % 20)).padStart(2, '0')}-${String(i)}`;
          const plan = generatePlan(room.graph, seed, tier);
          checked += 1;
          const result = validatePlan(plan, room.graph);
          if (!result.ok) {
            const codes = result.issues.map((item) => item.code).join(',');
            failures.push(`${room.name} ${tier} ${seed}: ${codes}`);
          }
          if (room.name === 'synthetic_living_room') {
            livingThemes.add(plan.theme);
          }
          assertMvpOnly(plan);
        }
      }
    }

    console.log(
      `generatePlan validity ${String(checked - failures.length)}/${String(checked)}` +
        ` (${String(ROOMS.length)} rooms × ${String(SEED_COUNT)} seeds × ${String(TIERS.length)} tiers)`
    );
    expect(failures.slice(0, 8)).toEqual([]);
    expect(failures).toHaveLength(0);
    expect(livingThemes.size).toBeGreaterThan(1);
  });

  it('fixture living-room plan still validates (generator does not break B-03)', () => {
    expect(validatePlan(SYNTHETIC_LIVING_ROOM_PLAN, SYNTHETIC_LIVING_ROOM).ok).toBe(
      true
    );
  });
});

function assertMvpOnly(plan: LevelPlan): void {
  for (const placement of plan.placements) {
    if (!(PIECE_IDS as readonly string[]).includes(placement.piece)) {
      throw new Error(`non-MVP piece ${placement.piece}`);
    }
  }
}
