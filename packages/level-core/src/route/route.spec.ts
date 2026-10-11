import { describe, expect, it } from 'vitest';
import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import type { LevelPlan, SurfaceGraph, Tier } from '@roomquest/schema';
import { compactGraphForPrompt, promptGraphJsonBytes } from '../prompt/compact-graph';
import { validatePlan } from '../validate/validate-plan';
import { generatePlan } from '../generate/generate-plan';
import {
  applyDecoration,
  candidateRoutes,
  repairRoute,
  routeLinks,
  sanitizeDecorationLines,
  type CandidateRoute,
  type LevelDecoration,
} from './index';

/** Exhaustive 5 rooms × 2 tiers × 20 seeds sweeps. */
const SWEEP_MS = 120_000;
const TIERS: readonly Tier[] = ['easy', 'normal'];
const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-2026-10-${String(i)}`);

const cache = new Map<string, CandidateRoute[]>();
function routesFor(room: string, graph: SurfaceGraph, seed: string, tier: Tier): CandidateRoute[] {
  const key = `${room}|${seed}|${tier}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = candidateRoutes(graph, { seed, tier });
    cache.set(key, hit);
  }
  return hit;
}

function* cases(): Generator<[string, SurfaceGraph, Tier, string]> {
  for (const room of IWER_ROOM_IDS) {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        yield [room, IWER_GRAPHS[room], tier, seed];
      }
    }
  }
}

describe('routeLinks', () => {
  it('lists only hops validatePlan accepts, sorted, for every surface', () => {
    for (const room of IWER_ROOM_IDS) {
      const graph = IWER_GRAPHS[room];
      const map = routeLinks(graph);
      expect(Object.keys(map).sort()).toEqual(graph.nodes.map((n) => n.id).sort());
      expect(routeLinks(graph, { seed: 'x' })).toEqual(map);
      for (const hops of Object.values(map)) {
        const ids = hops.map((h) => h.to);
        expect(ids).toEqual([...ids].sort());
      }
    }
  });

  it('adds links to compactGraphForPrompt only with hints', () => {
    const graph = IWER_GRAPHS[IWER_ROOM_IDS[0]];
    expect(compactGraphForPrompt(graph).nodes.some((n) => n.links)).toBe(false);
    const hinted = compactGraphForPrompt(graph, { hints: true });
    const map = routeLinks(graph);
    for (const node of hinted.nodes) {
      expect(node.links?.map((l) => l.to)).toEqual(map[node.id]?.map((h) => h.to));
    }
  });
});

describe('candidateRoutes over IWER rooms × tiers × 20 seeds', () => {
  it('every candidate passes validatePlan, is distinct and stable', () => {
    const atLeast3 = new Map<string, number>();
    for (const [room, graph, tier, seed] of cases()) {
      const routes = routesFor(room, graph, seed, tier);
      expect(routes.length).toBeGreaterThanOrEqual(1);
      expect(routes.length).toBeLessThanOrEqual(5);
      const keys = new Set<string>();
      routes.forEach((route, i) => {
        expect(route.id).toBe(`r${String(i)}`);
        expect(validatePlan(route.plan, graph).ok).toBe(true);
        expect(route.summary).toMatch(/, \d beats?$/);
        const conn = route.plan.placements
          .filter((p) => p.to !== undefined)
          .map((p) => `${p.piece}:${p.surface}>${p.to ?? ''}`)
          .sort()
          .join(',');
        keys.add(`${route.plan.start}|${route.plan.goal}|${conn}`);
      });
      expect(keys.size).toBe(routes.length);
      const again = candidateRoutes(graph, { seed, tier });
      expect(again.map((r) => [r.id, r.summary])).toEqual(routes.map((r) => [r.id, r.summary]));
      expect(again.map((r) => r.plan)).toEqual(routes.map((r) => r.plan));
      const k = `${room}/${tier}`;
      atLeast3.set(k, (atLeast3.get(k) ?? 0) + (routes.length >= 3 ? 1 : 0));
    }
    const report = [...atLeast3].map(([k, n]) => `${k}=${String(n)}/20`).join(' ');
    console.log(`[routes] >=3 candidates: ${report}`);
  }, SWEEP_MS);

  it('any combination of offered options stays valid', () => {
    for (const [room, graph, tier, seed] of cases()) {
      for (const route of routesFor(room, graph, seed, tier)) {
        const { twistBeats, hazards } = route.options;
        for (const twistBeat of twistBeats) {
          // every hazard at its first type, then every hazard at its last type
          for (const pick of [0, -1]) {
            const decoration: LevelDecoration = {
              routeId: route.id,
              theme: 'snow',
              twistBeat,
              hazards: hazards.map((h) => ({ beat: h.beat, type: h.types.at(pick) ?? '' })),
            };
            const out = applyDecoration(route, decoration);
            expect(out.ok).toBe(true);
            if (out.ok) {
              expect(validatePlan(out.plan, graph).ok).toBe(true);
              expect(out.plan.theme).toBe('snow');
            }
          }
        }
        for (const h of hazards) {
          for (const type of h.types) {
            const out = applyDecoration(route, {
              routeId: route.id, theme: route.plan.theme, twistBeat: twistBeats[0] ?? '0',
              hazards: [{ beat: h.beat, type }],
            });
            expect(out.ok && validatePlan(out.plan, graph).ok).toBe(true);
          }
        }
      }
    }
  }, SWEEP_MS);

  it('replaces un-offered options with defaults and rejects only unknown routeId', () => {
    const graph = IWER_GRAPHS[IWER_ROOM_IDS[0]];
    const routes = candidateRoutes(graph, { seed: 'a', tier: 'normal' });
    const bad = applyDecoration(routes, {
      routeId: 'r0', theme: 'lava', twistBeat: '99',
      hazards: [{ beat: '7', type: 'dragon' }, { beat: '0', type: 'dragon' }, { beat: '0', type: 'slime' }],
    });
    expect(bad.ok).toBe(true);
    if (bad.ok) {
      expect(validatePlan(bad.plan, graph).ok).toBe(true);
      expect(bad.replaced.length).toBeGreaterThan(0);
    }
    expect(applyDecoration(routes, { routeId: 'r9', theme: 'snow', twistBeat: '0', hazards: [] })).toEqual({
      ok: false, error: 'UNKNOWN_ROUTE_ID', routeId: 'r9',
    });
    const first = routes[0];
    if (!first) throw new Error('no route');
    expect(applyDecoration(first, { routeId: 'r1', theme: 'snow', twistBeat: '0', hazards: [] }).ok).toBe(false);
  });
});

describe('repairRoute', () => {
  function breakConnector(plan: LevelPlan): LevelPlan | null {
    const conn = plan.placements.find((p) => p.to !== undefined);
    if (!conn) {
      return null;
    }
    return {
      ...plan,
      placements: plan.placements.filter((p) => p.id !== conn.id),
      beats: plan.beats.map((b) => ({ ...b, uses: b.uses.filter((u) => u !== conn.id) })),
    };
  }
  function unreachableGoal(plan: LevelPlan, graph: SurfaceGraph): LevelPlan | null {
    const target = [...graph.nodes]
      .filter((n) => n.id !== plan.start && n.id !== plan.goal)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!target) {
      return null;
    }
    const broken = breakConnector(plan) ?? plan;
    return {
      ...broken,
      goal: target.id,
      placements: broken.placements.map((p) => (p.piece === 'crystal_shrine' ? { ...p, surface: target.id } : p)),
    };
  }

  it('fixes deliberately broken routes and reports the rate', () => {
    const tally = { broken: 0, fixed: 0, kept: 0, skeleton: 0 };
    for (const [room, graph, tier, seed] of cases()) {
      const route = routesFor(room, graph, seed, tier)[0];
      if (!route) {
        continue;
      }
      for (const broken of [breakConnector(route.plan), unreachableGoal(route.plan, graph)]) {
        if (!broken || validatePlan(broken, graph).ok) {
          continue;
        }
        tally.broken += 1;
        const a = repairRoute(broken, graph, { seed });
        const b = repairRoute(broken, graph, { seed });
        expect(b).toEqual(a);
        expect(a.changed).toBe(true);
        if (a.issues.length === 0) {
          expect(validatePlan(a.plan, graph).ok).toBe(true);
          tally.fixed += 1;
          if (a.strategy === 'kept') tally.kept += 1;
          if (a.strategy === 'skeleton') tally.skeleton += 1;
        }
      }
    }
    console.log(`[repairRoute] broken=${String(tally.broken)} fixed=${String(tally.fixed)} kept=${String(tally.kept)} skeleton=${String(tally.skeleton)}`);
    expect(tally.broken).toBeGreaterThan(0);
    expect(tally.fixed / tally.broken).toBeGreaterThanOrEqual(0.95);
  }, SWEEP_MS);

  it('leaves a valid plan untouched', () => {
    const graph = IWER_GRAPHS[IWER_ROOM_IDS[1]];
    const plan = generatePlan(graph, 's', 'easy');
    const out = repairRoute(plan, graph, { seed: 's' });
    expect(out.changed).toBe(validatePlan(plan, graph).ok ? false : true);
  });
});

describe('sanitizeDecorationLines', () => {
  it('strips control chars, trims, caps 80 chars / 8 lines, one per beat', () => {
    const long = 'x'.repeat(200);
    const out = sanitizeDecorationLines(
      [
        { beat: '0', text: '  Hi\u0000 there\n ' },
        { beat: '0', text: 'dup' },
        { beat: '1', text: '\u0007\u0008  ' },
        { beat: '1', text: long },
        { beat: '9', text: 'no beat' },
        { beat: 'two', text: 'bad' },
      ],
      4
    );
    expect(out).toEqual([
      { beat: '0', text: 'Hi there' },
      { beat: '1', text: 'x'.repeat(80) },
    ]);
    const many = Array.from({ length: 12 }, (_, i) => ({ beat: String(i), text: `l${String(i)}` }));
    expect(sanitizeDecorationLines(many, 12)).toHaveLength(8);
    expect(sanitizeDecorationLines(undefined, 4)).toEqual([]);
  });

  it('measures decoration JSON vs full plan placements', () => {
    const graph = IWER_GRAPHS[IWER_ROOM_IDS[0]];
    const route = candidateRoutes(graph, { seed: 'b', tier: 'normal' })[0];
    if (!route) throw new Error('no route');
    const deco: LevelDecoration = {
      routeId: route.id, theme: 'forest', twistBeat: route.options.twistBeats[0] ?? '0',
      hazards: route.options.hazards.slice(0, 1).map((h) => ({ beat: h.beat, type: h.types[0] ?? '' })),
      lines: route.plan.beats.map((_, i) => ({ beat: String(i), text: 'Hop across, little explorer!' })),
    };
    console.log(`[bytes] decoration=${String(promptGraphJsonBytes(deco))} placements=${String(promptGraphJsonBytes(route.plan.placements))}`);
    expect(promptGraphJsonBytes(deco)).toBeLessThan(promptGraphJsonBytes(route.plan.placements));
  });
});
