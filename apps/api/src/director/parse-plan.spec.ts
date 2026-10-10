import { describe, expect, it } from 'vitest';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { LevelPlan, type LevelPlanLLM } from '@roomquest/schema';
import { llmPlanToInput, tryParseLlmPlan } from './parse-plan';
import { planToLlmJson } from './test-fakes';

const hydrate = {
  seed: SYNTHETIC_LIVING_ROOM_PLAN.seed,
  graph: SYNTHETIC_LIVING_ROOM,
  tier: 'easy' as const,
};

function llmFromFixture(): Record<string, unknown> {
  return JSON.parse(planToLlmJson(SYNTHETIC_LIVING_ROOM_PLAN)) as Record<
    string,
    unknown
  >;
}

describe('tryParseLlmPlan', () => {
  it('hydrates a compact LevelPlanLLM and fills parTimeMs', () => {
    const raw = llmFromFixture();
    const result = tryParseLlmPlan(raw, hydrate);
    expect(result.parseError).toBeUndefined();
    expect(result.plan).toBeDefined();
    expect(result.plan?.parTimeMs).toBeGreaterThanOrEqual(60000);
    expect(result.plan?.parTimeMs).toBeLessThanOrEqual(480000);
    expect(result.plan?.start).toBe('s1');
    expect(result.plan?.goal).toBe('s2');
    expect(result.plan?.seed).toBe(hydrate.seed);
    expect(() => LevelPlan.parse(result.plan)).not.toThrow();
  });

  it('maps compact placement keys and drops nullable t', () => {
    const raw = llmFromFixture();
    const input = llmPlanToInput(resultPlan(raw), hydrate);
    const hut = (input.placements as Record<string, unknown>[])[0];
    expect(hut).toBeDefined();
    expect(hut).not.toHaveProperty('to');
    expect(hut?.id).toBe('p1');
    expect(hut?.piece).toBe('village_hut');
    const plank = (input.placements as Record<string, unknown>[])[1];
    expect(plank?.to).toBe('s2');
    expect(plank?.playerBuilt).toBe(true);
  });

  it('returns a parseError for garbage', () => {
    const result = tryParseLlmPlan({ title: 'nope' }, hydrate);
    expect(result.plan).toBeUndefined();
    expect(result.parseError).toBeDefined();
  });
});

function resultPlan(raw: Record<string, unknown>): LevelPlanLLM {
  const parsed = tryParseLlmPlan(raw, hydrate);
  if (parsed.llm === undefined) {
    throw new Error('expected llm parse');
  }
  return parsed.llm;
}
