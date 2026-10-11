import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { LevelRequest, LevelResponse, type LevelPlan } from '@roomquest/schema';
import { compactGraphForPrompt, validatePlan } from '@roomquest/level-core';
import { describe, expect, it } from 'vitest';
import {
  DIRECTOR_BUDGET_MS,
  DIRECTOR_LLM_WINDOW_MS,
  LLM_REPAIR_MIN_REMAINING_MS,
  PROCEDURAL_RESERVE_MS,
} from './director.constants';
import { wrapChatModel } from './models';
import type { StructuredChat } from './structured-chat';
import { PROMPT_VERSION } from './prompts';
import { runDirector } from './run-director';
import {
  settleWithDirectorFakeTime,
  useDirectorFakeTimers,
} from './test-clock';
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
  const hut = dirty.placements.find((item) => item.piece === 'village_hut');
  const shrine = dirty.placements.find(
    (item) => item.piece === 'crystal_shrine'
  );
  if (hut && shrine) {
    shrine.surface = hut.surface;
  }
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
    expect(outcome.telemetry[0]?.thoughtsTokenCount).toBe(5);
    expect(outcome.telemetry[0]?.thinkingTokens).toBe(5);
    expect(outcome.repairedBy).toBeNull();
    expect(outcome.validation.firstTry).toEqual([]);
    expect(outcome.validation.afterLocal).toBeNull();
    expect(outcome.firstTryPlan).toBeTruthy();
  });

  it('sends compactGraphForPrompt in the user message and validates against the full posted graph', async () => {
    let userJson: string | undefined;
    const primary: StructuredChat = {
      provider: 'google',
      model: 'gemini-3.8-flash',
      invokeStructured: (messages) => {
        const human = messages[1];
        if (
          human instanceof HumanMessage &&
          typeof human.content === 'string'
        ) {
          userJson = human.content;
        }
        return Promise.resolve({
          parsed: JSON.parse(validJson) as unknown,
          raw: new AIMessage(validJson),
        });
      },
    };
    const outcome = await runDirector(request, {
      primary,
      logger: silentLogger,
    });
    expect(userJson).toBeDefined();
    const parsed = JSON.parse(userJson ?? '') as { graph: unknown };
    expect(parsed.graph).toEqual(compactGraphForPrompt(request.graph));
    expect(parsed.graph).not.toEqual(request.graph);
    expect(parsed.graph).not.toHaveProperty('version');
    expect(parsed.graph).not.toHaveProperty('roomHash');
    expect(parsed.graph).not.toHaveProperty('floorY');
    expect(request.graph.version).toBeDefined();
    expect(request.graph.roomHash).toBeDefined();
    expect(validatePlan(outcome.response.plan, request.graph).ok).toBe(true);
    expect(outcome.response.source).toBe('llm');
  });

  it('feeds includeRaw text into local repair when structured parse fails', async () => {
    let calls = 0;
    const primary: StructuredChat = {
      provider: 'google',
      model: 'gemini-3.8-flash',
      invokeStructured: () => {
        calls += 1;
        return Promise.resolve({
          parsed: null,
          raw: new AIMessage(dirtyLocalRepairJson()),
        });
      },
    };
    const outcome = await runDirector(request, {
      primary,
      logger: silentLogger,
    });
    expect(calls).toBe(1);
    expect(outcome.response.source).toBe('llm_repaired');
    expect(outcome.response.repairs.length).toBeGreaterThan(0);
    expect(validatePlan(outcome.response.plan, request.graph).ok).toBe(true);
    expect(outcome.telemetry).toHaveLength(1);
    expect(outcome.telemetry[0]?.outcome).toBe('invalid');
    expect(
      outcome.response.plan.placements.some((p) => p.id === 'p-slime')
    ).toBe(false);
    expect(outcome.repairedBy).toBe('local');
    expect(outcome.validation.afterLocal).toEqual([]);
    expect(outcome.validation.afterLlmRepair).toBeNull();
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
    expect(outcome.repairedBy).toBe('local');
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
    expect(outcome.repairedBy).toBe('llm');
    expect(outcome.validation.afterLocal?.length).toBeGreaterThan(0);
    expect(outcome.validation.afterLlmRepair).toEqual([]);
    expect(outcome.validation.firstTry.length).toBeGreaterThan(0);
    expect(outcome.validation.firstTry[0]?.code).toBeTruthy();
  });

  describe('budget', () => {
    useDirectorFakeTimers();

    it('aborts hanging LLM work 250 ms before the 7 s whole-request deadline', async () => {
      const fake = new HangingFakeListChatModel();
      const outcome = await settleWithDirectorFakeTime(
        runDirector(request, {
          primary: structuredFromFake(fake),
          logger: silentLogger,
        })
      );
      expect(outcome.response.source).toBe('procedural');
      expect(outcome.response.model).toBeUndefined();
      expect(LevelResponse.parse(outcome.response).source).toBe('procedural');
      expect(outcome.telemetry.some((row) => row.outcome === 'timeout')).toBe(
        true
      );
      expect(outcome.response.latencyMs).toBe(DIRECTOR_LLM_WINDOW_MS);
      expect(Date.now()).toBe(DIRECTOR_LLM_WINDOW_MS);
      expect(Date.now()).toBeLessThan(DIRECTOR_BUDGET_MS);
    });

    it('skips the LLM repair call when fewer than 2 s of LLM window remain', async () => {
      let t = 0;
      const fake = new AfterGenerateFakeListChatModel({
        responses: [startEqualsGoalJson(), validJson],
      });
      fake.onAfterGenerate = () => {
        t = DIRECTOR_LLM_WINDOW_MS - LLM_REPAIR_MIN_REMAINING_MS + 1;
      };
      const outcome = await runDirector(request, {
        primary: structuredFromFake(fake),
        budgetMs: DIRECTOR_BUDGET_MS,
        proceduralReserveMs: PROCEDURAL_RESERVE_MS,
        llmRepairMinRemainingMs: LLM_REPAIR_MIN_REMAINING_MS,
        now: () => t,
        logger: silentLogger,
      });
      expect(outcome.response.source).toBe('procedural');
      expect(outcome.telemetry).toHaveLength(1);
      expect(outcome.telemetry[0]?.outcome).toBe('invalid');
      expect(validatePlan(outcome.response.plan, request.graph).ok).toBe(true);
    });

    it('returns procedural within the 7 s budget when first and repair calls are both slow', async () => {
      const fake = new SlowFakeListChatModel({
        responses: [startEqualsGoalJson(), validJson],
        delaysMs: [3_000, 10_000],
      });
      const outcome = await settleWithDirectorFakeTime(
        runDirector(request, {
          primary: structuredFromFake(fake),
          logger: silentLogger,
        })
      );
      expect(outcome.response.source).toBe('procedural');
      expect(LevelResponse.parse(outcome.response).source).toBe('procedural');
      expect(validatePlan(outcome.response.plan, request.graph).ok).toBe(true);
      expect(outcome.response.latencyMs).toBe(DIRECTOR_LLM_WINDOW_MS);
      expect(outcome.response.latencyMs).toBeLessThan(DIRECTOR_BUDGET_MS);
      expect(outcome.telemetry[0]?.outcome).toBe('invalid');
      expect(outcome.telemetry.some((row) => row.outcome === 'timeout')).toBe(
        true
      );
    });

    it('goes straight to procedural within the budget when Gemini fails', async () => {
      let t = 0;
      const primary = new ThrowingFakeListChatModel(new Error('gemini down'));
      primary.onThrow = () => {
        t = 400;
      };
      const outcome = await runDirector(request, {
        primary: structuredFromFake(primary, 'google', 'gemini-3.8-flash'),
        budgetMs: DIRECTOR_BUDGET_MS,
        proceduralReserveMs: PROCEDURAL_RESERVE_MS,
        now: () => t,
        logger: silentLogger,
      });
      expect(outcome.response.source).toBe('procedural');
      expect(outcome.response.model).toBeUndefined();
      expect(outcome.response.latencyMs).toBeLessThan(DIRECTOR_BUDGET_MS);
      expect(outcome.telemetry).toHaveLength(1);
      expect(outcome.telemetry[0]?.provider).toBe('google');
      expect(outcome.telemetry[0]?.outcome).toBe('error');
      expect(validatePlan(outcome.response.plan, request.graph).ok).toBe(true);
    });

    it('invokes Gemini exactly once on a provider error (no hidden retries)', async () => {
      let t = 0;
      const primary = new ThrowingFakeListChatModel(new Error('gemini down'));
      primary.onThrow = () => {
        t = 400;
      };
      const outcome = await runDirector(request, {
        primary: wrapChatModel(primary, 'google', 'gemini-3.8-flash'),
        budgetMs: DIRECTOR_BUDGET_MS,
        proceduralReserveMs: PROCEDURAL_RESERVE_MS,
        now: () => t,
        logger: silentLogger,
      });
      expect(primary.generateCalls).toBe(1);
      expect(outcome.response.source).toBe('procedural');
      expect(outcome.telemetry).toHaveLength(1);
      expect(outcome.telemetry[0]?.outcome).toBe('error');
    });
  });

  it('records first-try raw text when structured parse fails', async () => {
    const primary: StructuredChat = {
      provider: 'google',
      model: 'gemini-3.8-flash',
      invokeStructured: () =>
        Promise.resolve({
          parsed: { nope: true },
          raw: { content: '{"nope":true}' },
        }),
    };
    const outcome = await runDirector(request, {
      primary,
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('procedural');
    expect(outcome.firstTryPlan).toEqual({ nope: true });
    expect(outcome.firstTryRawText).toBe('{"nope":true}');
    expect(outcome.validation.firstTry[0]?.code).toBe('SCHEMA_INVALID');
    expect(outcome.repairedBy).toBeNull();
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
