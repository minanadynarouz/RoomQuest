import { describe, expect, it } from 'vitest';
import { SYNTHETIC_LIVING_ROOM_PLAN } from '@roomquest/fixtures';
import { LevelPlan, type LevelPlanLLM } from '@roomquest/schema';
import { llmPlanToInput, tryParseLlmPlan } from './parse-plan';

function llmFromFixture(): Record<string, unknown> {
  return {
    ...SYNTHETIC_LIVING_ROOM_PLAN,
    placements: SYNTHETIC_LIVING_ROOM_PLAN.placements.map((placement) => ({
      ...placement,
      to: placement.to ?? null,
    })),
  };
}

describe('tryParseLlmPlan', () => {
  it('parses a fixture-shaped LevelPlanLLM and clamps parTimeMs', () => {
    const raw = { ...llmFromFixture(), parTimeMs: 500 };
    const result = tryParseLlmPlan(raw);
    expect(result.parseError).toBeUndefined();
    expect(result.plan).toBeDefined();
    expect(result.plan?.parTimeMs).toBe(60000);
    expect(() => LevelPlan.parse(result.plan)).not.toThrow();
  });

  it('drops nullable Placement.to so LevelPlan.parse succeeds', () => {
    const raw = llmFromFixture();
    const input = llmPlanToInput(
      resultPlan(raw)
    );
    const hut = (input.placements as Record<string, unknown>[])[0];
    expect(hut).toBeDefined();
    expect(hut).not.toHaveProperty('to');
  });

  it('returns a parseError for garbage', () => {
    const result = tryParseLlmPlan({ title: 'nope' });
    expect(result.plan).toBeUndefined();
    expect(result.parseError).toBeDefined();
  });
});

function resultPlan(raw: Record<string, unknown>): LevelPlanLLM {
  const parsed = tryParseLlmPlan(raw);
  if (parsed.llm === undefined) {
    throw new Error('expected llm parse');
  }
  return parsed.llm;
}
