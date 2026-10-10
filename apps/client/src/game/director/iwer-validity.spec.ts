/**
 * generatePlan + snap + repairPlan on every IWER room.
 * No live Gemini / staging /levels — director=off and mocked fetch.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  IWER_GRAPHS,
  IWER_ROOM_IDS,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { generatePlan, validatePlan } from '@roomquest/level-core';
import type { Tier } from '@roomquest/schema';
import { createDirectorClient } from './client.js';
import { recoverPlan } from './recover.js';
import type { FetchLike } from './types.js';

const TIERS: readonly Tier[] = ['easy', 'normal'];
const SEEDS = ['2026-10-10', '2026-10-11', '2026-10-12'] as const;

function isFixturePlan(plan: { title: string; seed: string }): boolean {
  return (
    plan.title === SYNTHETIC_LIVING_ROOM_PLAN.title &&
    plan.seed === SYNTHETIC_LIVING_ROOM_PLAN.seed
  );
}

describe('IWER generatePlan + snap + repairPlan', () => {
  it('plays a generated plan (not the fixture) in all 5 rooms × 2 tiers', async () => {
    const fetchFn = vi.fn<FetchLike>(() => {
      throw new Error('live /levels must not be called');
    });
    const lines: string[] = [];
    const fixtureHits: string[] = [];
    const invalid: string[] = [];

    for (const room of IWER_ROOM_IDS) {
      const graph = IWER_GRAPHS[room];
      const surfaceIds = new Set(graph.nodes.map((node) => node.id));
      for (const tier of TIERS) {
        let valid = 0;
        for (const date of SEEDS) {
          const seed = `${graph.roomHash}-${date}`;
          const generated = generatePlan(graph, seed, tier);
          const recovered = await recoverPlan(generated, graph);
          const played = recovered.ok ? recovered.plan : generated;
          const ok = recovered.ok && validatePlan(played, graph).ok;
          if (ok) {
            valid += 1;
          } else {
            invalid.push(
              `${room} ${tier} ${seed}: ${recovered.issues.map((issue) => issue.code).join(',') || 'invalid'}`
            );
          }
          if (isFixturePlan(played)) {
            fixtureHits.push(`${room} ${tier} ${seed}`);
          }
          expect(played.seed).toBe(seed);
          expect(surfaceIds.has(played.start)).toBe(true);
          expect(surfaceIds.has(played.goal)).toBe(true);
          expect(
            played.placements.every((item) => surfaceIds.has(item.surface))
          ).toBe(true);

          const director = createDirectorClient({
            fetch: fetchFn,
            apiBaseUrl: 'http://localhost:3000',
            deviceId: '11111111-2222-4333-8444-555555555555',
            directorMode: 'off',
            seed,
            tier,
            allowFixtureFallback: false,
          });
          const result = await director.requestPlan(graph);
          expect(fetchFn).not.toHaveBeenCalled();
          expect(result.fallbackReason).not.toBeUndefined();
          if (result.fallbackReason === 'room-unplayable') {
            invalid.push(`${room} ${tier} ${seed}: director room-unplayable`);
            continue;
          }
          expect(isFixturePlan(result.plan)).toBe(false);
          expect(result.plan.seed).toBe(seed);
          expect(result.source).toBe('procedural');
        }
        const rate = `${String(valid)}/${String(SEEDS.length)}`;
        lines.push(`${room} ${tier}: ${rate}`);
      }
    }

    console.log(`[iwer-validity]\n${lines.join('\n')}`);
    expect(fixtureHits, `fixture fallback: ${fixtureHits.join('; ')}`).toEqual(
      []
    );
    if (invalid.length > 0) {
      console.warn(`[iwer-validity] invalid\n${invalid.join('\n')}`);
    }
    expect(invalid, invalid.join('\n')).toEqual([]);
    expect(IWER_ROOM_IDS).toHaveLength(5);
  });
});
