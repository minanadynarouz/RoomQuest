/**
 * Local generator used until B-04 merge.
 *
 * Plan re-validation is `validatePlan` from `@roomquest/level-core` (B-03).
 * B-04 replaces `stubGenerate` with `level-core.generate`.
 *
 * The stub is deterministic for (graph, seed, tier) and always returns a
 * schema-valid plan on any graph with ≥ 2 nodes, so the client can keep the
 * "always a valid plan in ≤ 8 s" guarantee without the generator package.
 */

import type { LevelPlan, SurfaceGraph, Tier } from '@roomquest/schema';

const THEMES = ['forest', 'desert', 'snow', 'sky'] as const;

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic stub generator. B-04 replaces this with the real procedural
 * generator; keep the `GenerateFn` signature so the swap is a one-line import.
 */
export function stubGenerate(
  graph: SurfaceGraph,
  seed: string,
  _tier: Tier
): LevelPlan {
  const startNode = graph.nodes[0];
  const goalNode = graph.nodes[1];
  if (!startNode || !goalNode) {
    throw new Error('Surface graph needs at least 2 nodes to generate a plan');
  }

  const theme = THEMES[hashSeed(seed) % THEMES.length] ?? 'forest';
  const start = startNode.id;
  const goal = goalNode.id;

  return {
    seed,
    theme,
    title: 'Roomquest',
    start,
    goal,
    parTimeMs: 180000,
    placements: [
      {
        id: 'p1',
        piece: 'village_hut',
        surface: start,
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p2',
        piece: 'crystal_shrine',
        surface: goal,
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p3',
        piece: 'plank_bridge',
        surface: start,
        to: goal,
        u: 0.8,
        v: 0.5,
        playerBuilt: true,
        links: [],
      },
      {
        id: 'p4',
        piece: 'gem',
        surface: start,
        u: 0.2,
        v: 0.3,
        playerBuilt: false,
        links: [],
      },
    ],
    beats: [
      { goal: 'Bridge the gap', uses: ['p3'] },
      { goal: 'Reach the shrine', uses: ['p2'] },
    ],
    dialogue: [
      { trigger: 'intro', line: 'Help me cross your room!' },
      { trigger: 'win', line: 'We made it!' },
    ],
  };
}

/** Used only if the injected generator throws. */
export function lastResortPlan(graph: SurfaceGraph, seed: string): LevelPlan {
  return stubGenerate(graph, seed, 'normal');
}
