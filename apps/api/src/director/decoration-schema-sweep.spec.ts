import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import {
  applyDecoration,
  candidateRoutes,
  validatePlan,
  type CandidateRoute,
} from '@roomquest/level-core';
import {
  buildLevelDecorationGeminiSchema,
  buildLevelDecorationSchema,
  validateLLMSafeJsonSchema,
  type Tier,
} from '@roomquest/schema';
import { describe, expect, it } from 'vitest';
import { decorationEnums } from './prompts/decoration';
import { parseRouteDecoration, routeCallOptions } from './route-arm';

const TIERS: readonly Tier[] = ['easy', 'normal'];
const SEEDS = Array.from({ length: 20 }, (_v, i) => `sweep-seed-${String(i)}`);

/** Keys Gemini's responseSchema rejects; an empty enum is invalid too. */
function geminiProblems(value: unknown, path = '$'): string[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const out: string[] = [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.type)) {
    out.push(`${path}: type array`);
  }
  if (Array.isArray(record.enum) && record.enum.length === 0) {
    out.push(`${path}: empty enum`);
  }
  for (const key of ['anyOf', 'oneOf', 'allOf', 'const', 'pattern', '$schema']) {
    if (key in record) {
      out.push(`${path}: ${key}`);
    }
  }
  for (const [key, child] of Object.entries(record)) {
    out.push(...geminiProblems(child, `${path}.${key}`));
  }
  return out;
}

describe('decoration schema sweep (IWER rooms × tiers × 20 seeds)', () => {
  for (const roomId of IWER_ROOM_IDS) {
    for (const tier of TIERS) {
      it(`${roomId} × ${tier}: never throws, schema Gemini-valid`, () => {
        let checked = 0;
        for (const seed of SEEDS) {
          const candidates = candidateRoutes(IWER_GRAPHS[roomId], { seed, tier });
          if (candidates.length === 0) {
            continue;
          }
          const enums = decorationEnums(candidates);
          const label = `${roomId}/${tier}/${seed}`;
          expect(() => buildLevelDecorationSchema(enums), label).not.toThrow();
          const gemini = buildLevelDecorationGeminiSchema(enums);
          expect(validateLLMSafeJsonSchema(gemini), label).toEqual([]);
          expect(geminiProblems(gemini), label).toEqual([]);
          expect(routeCallOptions(enums).responseSchema).toEqual(gemini);
          const props = gemini.properties as Record<string, unknown>;
          expect('hazards' in props, label).toBe(enums.hazardTypes.length > 0);
          checked += 1;
        }
        expect(checked).toBeGreaterThan(0);
      });
    }
  }
});

describe('empty hazard types', () => {
  function strippedCandidates(): CandidateRoute[] {
    const roomId = IWER_ROOM_IDS[0];
    const routes = candidateRoutes(IWER_GRAPHS[roomId], {
      seed: 'empty-hazards',
      tier: 'easy',
    });
    expect(routes.length).toBeGreaterThan(0);
    return routes.map((route) => ({
      ...route,
      options: { ...route.options, hazards: [] },
    }));
  }

  it('decorationEnums → no hazardTypes; schema omits hazards and stays valid', () => {
    const candidates = strippedCandidates();
    const enums = decorationEnums(candidates);
    expect(enums.hazardTypes).toEqual([]);
    const gemini = buildLevelDecorationGeminiSchema(enums);
    expect(validateLLMSafeJsonSchema(gemini)).toEqual([]);
    expect(geminiProblems(gemini)).toEqual([]);
    expect(gemini.properties).not.toHaveProperty('hazards');
  });

  it('route arm parses and applies a decoration with no hazards property', () => {
    const candidates = strippedCandidates();
    const enums = decorationEnums(candidates);
    const route = candidates[0];
    if (route === undefined) throw new Error('no candidate route');
    const raw = {
      routeId: route.id,
      theme: 'forest',
      twistBeat: route.options.twistBeats[0] ?? '0',
    };
    const parsed = parseRouteDecoration(raw, enums);
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;
    expect(parsed.decoration.hazards).toBeUndefined();
    const applied = applyDecoration(candidates, parsed.decoration);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(validatePlan(applied.plan, route.graph).ok).toBe(true);
    // Empty array behaves the same.
    const empty = applyDecoration(candidates, { ...parsed.decoration, hazards: [] });
    expect(empty.ok).toBe(true);
  });
});
