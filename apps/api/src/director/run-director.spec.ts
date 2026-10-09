import { FakeListChatModel } from '@langchain/core/utils/testing';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { LevelRequest, LevelResponse, type LevelPlan } from '@roomquest/schema';
import { validatePlan } from '@roomquest/level-core';
import { describe, expect, it } from 'vitest';
import { PROMPT_VERSION } from './prompts';
import { wrapChatModel } from './models';
import { runDirector } from './run-director';
import {
  AfterGenerateFakeListChatModel,
  HangingFakeListChatModel,
  planToLlmJson,
  silentLogger,
  SlowFakeListChatModel,
  structuredFromFake,
  ThrowingFakeListChatModel,
  UsageFakeListChatModel,
} from './test-fakes';

const request = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-10-14',
  tier: 'easy',
});

const validJson = planToLlmJson(SYNTHETIC_LIVING_ROOM_PLAN);

function dirtyLocalRepairJson(): string {
  const dirty: LevelPlan = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
  dirty.placements.push({
    id: 'p-slime',
    piece: 'slime',
    surface: 's5',
    u: 0.5,
    v: 0.5,
    playerBuilt: false,
    links: [],
  });
  return planToLlmJson(dirty);
}

function startEqualsGoalJson(): string {
  const dirty: LevelPlan = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
  dirty.goal = dirty.start;
  return planToLlmJson(dirty);
}

describe('runDirector', () => {
  it('parses FakeListChatModel.withStructuredOutput via wrapChatModel', async () => {
    const fake = new FakeListChatModel({ responses: [validJson] });
    const outcome = await runDirector(request, {
      primary: wrapChatModel(fake, 'google', 'gemini-3.8-flash'),
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('llm');
  });

  it('returns source llm on a valid first try', async () => {
    const fake = new UsageFakeListChatModel({ responses: [validJson] });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      logger: silentLogger,
    });
    const parsed = LevelResponse.parse(outcome.response);
    expect(parsed.source).toBe('llm');
    expect(parsed.model).toBe('gemini-3.8-flash');
    expect(parsed.promptVersion).toBe(PROMPT_VERSION);
    expect(parsed.repairs).toEqual([]);
    expect(validatePlan(parsed.plan, request.graph).ok).toBe(true);
    expect(outcome.telemetry).toHaveLength(1);
    expect(outcome.telemetry[0]?.outcome).toBe('ok');
    expect(outcome.telemetry[0]?.inputTokens).toBe(12);
    expect(outcome.telemetry[0]?.outputTokens).toBe(34);
  });

  it('locally repairs an invalid first plan without a second LLM call', async () => {
    const fake = new FakeListChatModel({
      responses: [dirtyLocalRepairJson()],
    });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('llm_repaired');
    expect(outcome.response.repairs.length).toBeGreaterThan(0);
    expect(validatePlan(outcome.response.plan, request.graph).ok).toBe(true);
    expect(outcome.telemetry).toHaveLength(1);
    expect(outcome.telemetry[0]?.outcome).toBe('invalid');
    expect(
      outcome.response.plan.placements.some((p) => p.id === 'p-slime')
    ).toBe(false);
  });

  it('uses one LLM repair call when local repair is not enough', async () => {
    const fake = new FakeListChatModel({
      responses: [startEqualsGoalJson(), validJson],
    });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('llm_repaired');
    expect(outcome.response.repairs).toContain('llm-repair');
    expect(validatePlan(outcome.response.plan, request.graph).ok).toBe(true);
    expect(outcome.telemetry.map((row) => row.outcome)).toEqual([
      'invalid',
      'repaired',
    ]);
  });

  it('falls back to procedural on timeout', async () => {
    const fake = new HangingFakeListChatModel();
    const budgetMs = 80;
    const started = Date.now();
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      budgetMs,
      proceduralReserveMs: 25,
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('procedural');
    expect(outcome.response.model).toBeUndefined();
    expect(LevelResponse.parse(outcome.response).source).toBe('procedural');
    expect(outcome.telemetry.some((row) => row.outcome === 'timeout')).toBe(
      true
    );
    expect(outcome.response.latencyMs).toBeLessThan(budgetMs);
    expect(Date.now() - started).toBeLessThan(budgetMs);
  });

  it('skips the LLM repair call when fewer than 2 s of LLM window remain', async () => {
    let t = 0;
    const fake = new AfterGenerateFakeListChatModel({
      responses: [startEqualsGoalJson(), validJson],
    });
    fake.onAfterGenerate = () => {
      t = 5200;
    };
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      budgetMs: 7000,
      proceduralReserveMs: 250,
      llmRepairMinRemainingMs: 2000,
      now: () => t,
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('procedural');
    expect(outcome.telemetry).toHaveLength(1);
    expect(outcome.telemetry[0]?.outcome).toBe('invalid');
    expect(validatePlan(outcome.response.plan, request.graph).ok).toBe(true);
  });

  it('returns 200 procedural within the budget when first and repair calls are both slow', async () => {
    const budgetMs = 250;
    const fake = new SlowFakeListChatModel({
      responses: [startEqualsGoalJson(), validJson],
      delaysMs: [40, 2000],
    });
    const started = Date.now();
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      budgetMs,
      proceduralReserveMs: 50,
      llmRepairMinRemainingMs: 30,
      logger: silentLogger,
    });
    const elapsed = Date.now() - started;
    expect(outcome.response.source).toBe('procedural');
    expect(LevelResponse.parse(outcome.response).source).toBe('procedural');
    expect(validatePlan(outcome.response.plan, request.graph).ok).toBe(true);
    expect(outcome.response.latencyMs).toBeLessThan(budgetMs);
    expect(elapsed).toBeLessThan(budgetMs);
    expect(outcome.telemetry[0]?.outcome).toBe('invalid');
    expect(outcome.telemetry.some((row) => row.outcome === 'timeout')).toBe(
      true
    );
  });

  it('falls back to the secondary model on a provider error when budget remains', async () => {
    const primary = new ThrowingFakeListChatModel(
      new Error('gemini unavailable')
    );
    const fallback = new FakeListChatModel({ responses: [validJson] });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(primary, 'google', 'gemini-3.8-flash'),
      fallback: structuredFromFake(
        fallback,
        'anthropic',
        'claude-haiku-4-5'
      ),
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('llm');
    expect(outcome.response.model).toBe('claude-haiku-4-5');
    expect(outcome.telemetry[0]?.outcome).toBe('error');
    expect(outcome.telemetry[0]?.provider).toBe('google');
    expect(outcome.telemetry[1]?.outcome).toBe('ok');
    expect(outcome.telemetry[1]?.provider).toBe('anthropic');
  });

  it('skips the fallback model when fewer than 3 s remain', async () => {
    let t = 0;
    const primary = new ThrowingFakeListChatModel(new Error('gemini down'));
    primary.onThrow = () => {
      t = 4500;
    };
    const fallback = new FakeListChatModel({ responses: [validJson] });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(primary),
      fallback: structuredFromFake(
        fallback,
        'anthropic',
        'claude-haiku-4-5'
      ),
      budgetMs: 7000,
      fallbackMinRemainingMs: 3000,
      now: () => t,
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('procedural');
    expect(outcome.response.model).toBeUndefined();
    expect(outcome.telemetry.some((row) => row.provider === 'anthropic')).toBe(
      false
    );
  });

  it('falls back to procedural after two invalid LLM plans', async () => {
    const fake = new FakeListChatModel({
      responses: [startEqualsGoalJson(), startEqualsGoalJson()],
    });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('procedural');
    expect(validatePlan(outcome.response.plan, request.graph).ok).toBe(true);
    expect(
      outcome.telemetry.filter((row) => row.outcome === 'invalid').length
    ).toBeGreaterThanOrEqual(2);
  });
});
