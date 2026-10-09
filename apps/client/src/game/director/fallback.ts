/**
 * Local generator + validator used until B-03/B-04 merge.
 *
 * Swap points:
 * - B-03: replace `schemaValidate` with `level-core.validate`
 * - B-04: replace `stubGenerate` with `level-core.generate`
 *
 * The stub is deterministic for (graph, seed, tier) and always returns a
 * schema-valid plan on any graph with ≥ 2 nodes, so the client can keep the
 * "always a valid plan in ≤ 8 s" guarantee without the generator package.
 */

import { LevelPlan, type SurfaceGraph, type Tier } from '@roomquest/schema';
import type { ValidateResult } from './types.js';

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
 * Schema parse plus surface-id checks against the local graph.
 * Does not run kit constraints or BFS solvability (those land with B-03).
 */
export function schemaValidate(
  plan: LevelPlan,
  graph: SurfaceGraph
): ValidateResult {
  const parsed = LevelPlan.safeParse(plan);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
      ),
    };
  }

  const ids = new Set(graph.nodes.map((node) => node.id));
  const issues: string[] = [];

  if (!ids.has(plan.start)) {
    issues.push(`unknown start surface ${plan.start}`);
  }
  if (!ids.has(plan.goal)) {
    issues.push(`unknown goal surface ${plan.goal}`);
  }

  for (const placement of plan.placements) {
    if (!ids.has(placement.surface)) {
      issues.push(
        `placement ${placement.id} references unknown surface ${placement.surface}`
      );
    }
    if (placement.to && !ids.has(placement.to)) {
      issues.push(
        `placement ${placement.id} references unknown to surface ${placement.to}`
      );
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true };
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
