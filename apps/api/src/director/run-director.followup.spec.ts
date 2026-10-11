import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import {
  hintedSlotIds,
  listHintedSlots,
  validatePlan,
} from '@roomquest/level-core';
import {
  LevelRequest,
  LevelResponse,
  type LevelPlan,
  type LevelPlanLLM,
} from '@roomquest/schema';
import { describe, expect, it } from 'vitest';
import { makeDailySeed } from '../levels/daily-seed';
import {
  DIRECTOR_LLM_WINDOW_MS,
  LLM_REPAIR_MIN_REMAINING_MS,
} from './director.constants';
import { runDirector } from './run-director';
import type { StructuredCallOptions, StructuredChat } from './structured-chat';
import {
  settleWithDirectorFakeTime,
  useDirectorFakeTimers,
} from './test-clock';
import {
  HangingFakeListChatModel,
  planToLlmJson,
  silentLogger,
  SlowFakeListChatModel,
  structuredFromFake,
  ThrowingFakeListChatModel,
} from './test-fakes';

const request = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-10-14',
  tier: 'easy',
});
const seed = makeDailySeed(request.graph.roomHash, request.date);
const validJson = planToLlmJson(SYNTHETIC_LIVING_ROOM_PLAN);

/** Invalid in a way snap/repairRoute/repairPlan cannot fix (no shrine). */
function unfixableLocallyJson(): string {
  const dirty: LevelPlan = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
  dirty.placements = dirty.placements.filter(
    (item) => item.piece !== 'crystal_shrine'
  );
  return planToLlmJson(dirty);
}

function expectProcedural(
  outcome: Awaited<ReturnType<typeof runDirector>>,
  reason: string,
  failedAt: string
): void {
  expect(outcome.response.source).toBe('procedural');
  expect(outcome.response.fallbackReason).toBe(reason);
  expect(outcome.failedAt).toBe(failedAt);
  expect(outcome.stage).toBe('procedural');
  expect(validatePlan(outcome.response.plan, request.graph).ok).toBe(true);
  expect(LevelResponse.parse(outcome.response).fallbackReason).toBe(reason);
}

describe('runDirector LLM repair time gate (fake timers)', () => {
  useDirectorFakeTimers();

  it(`skips the repair call with llm-invalid when < ${String(LLM_REPAIR_MIN_REMAINING_MS)} ms remain`, async () => {
    // First call ends 1 ms past the gate: remaining = gate - 1.
    const firstDelay = DIRECTOR_LLM_WINDOW_MS - LLM_REPAIR_MIN_REMAINING_MS + 1;
    const fake = new SlowFakeListChatModel({
      responses: [unfixableLocallyJson(), validJson],
      delaysMs: [firstDelay, 0],
    });
    const outcome = await settleWithDirectorFakeTime(
      runDirector(request, {
        primary: structuredFromFake(fake),
        logger: silentLogger,
      })
    );
    expectProcedural(outcome, 'llm-invalid', 'llm-repair-gate');
    expect(outcome.telemetry).toHaveLength(1);
    expect(outcome.telemetry[0]?.outcome).toBe('invalid');
    expect(outcome.validation.afterLocal?.length).toBeGreaterThan(0);
    expect(outcome.validation.afterLlmRepair).toBeNull();
  });

  it('attempts the repair call when exactly the gate remains', async () => {
    const firstDelay = DIRECTOR_LLM_WINDOW_MS - LLM_REPAIR_MIN_REMAINING_MS;
    const fake = new SlowFakeListChatModel({
      responses: [unfixableLocallyJson(), validJson],
      delaysMs: [firstDelay, 0],
    });
    const outcome = await settleWithDirectorFakeTime(
      runDirector(request, {
        primary: structuredFromFake(fake),
        logger: silentLogger,
      })
    );
    expect(outcome.response.source).toBe('llm_repaired');
    expect(outcome.stage).toBe('llm-repair');
    expect(outcome.response.fallbackReason).toBeUndefined();
    expect(outcome.telemetry.map((row) => row.outcome)).toEqual([
      'invalid',
      'repaired',
    ]);
  });

  it('honours a custom llmRepairMinRemainingMs (env LLM_REPAIR_MIN_REMAINING_MS)', async () => {
    const fake = new SlowFakeListChatModel({
      responses: [unfixableLocallyJson(), validJson],
      delaysMs: [1_000, 0],
    });
    const outcome = await settleWithDirectorFakeTime(
      runDirector(request, {
        primary: structuredFromFake(fake),
        llmRepairMinRemainingMs: DIRECTOR_LLM_WINDOW_MS,
        logger: silentLogger,
      })
    );
    expectProcedural(outcome, 'llm-invalid', 'llm-repair-gate');
    expect(outcome.telemetry).toHaveLength(1);
  });

  it('records llm-timeout when the first call hangs', async () => {
    const outcome = await settleWithDirectorFakeTime(
      runDirector(request, {
        primary: structuredFromFake(new HangingFakeListChatModel()),
        logger: silentLogger,
      })
    );
    expectProcedural(outcome, 'llm-timeout', 'draft');
  });

  it('records llm-timeout at llm-repair when the repair call is aborted', async () => {
    const fake = new SlowFakeListChatModel({
      responses: [unfixableLocallyJson(), validJson],
      delaysMs: [1_000, 60_000],
    });
    const outcome = await settleWithDirectorFakeTime(
      runDirector(request, {
        primary: structuredFromFake(fake),
        logger: silentLogger,
      })
    );
    expectProcedural(outcome, 'llm-timeout', 'llm-repair');
  });
});

describe('runDirector fallback reasons (no blank reasons)', () => {
  it('records llm-error on a provider error', async () => {
    const primary = new ThrowingFakeListChatModel(new Error('gemini down'));
    const outcome = await runDirector(request, {
      primary: structuredFromFake(primary),
      logger: silentLogger,
    });
    expectProcedural(outcome, 'llm-error', 'draft');
  });

  it('records llm-invalid after an invalid LLM repair', async () => {
    const fake = new FakeListChatModel({
      responses: [unfixableLocallyJson(), unfixableLocallyJson()],
    });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      logger: silentLogger,
    });
    expectProcedural(outcome, 'llm-invalid', 'llm-repair');
    expect(outcome.validation.afterLlmRepair?.length).toBeGreaterThan(0);
  });

  it('records llm-parse-failed when neither call parses', async () => {
    const primary: StructuredChat = {
      provider: 'google',
      model: 'gemini-3.8-flash',
      invokeStructured: () =>
        Promise.resolve({ parsed: null, raw: new AIMessage('not json') }),
    };
    const outcome = await runDirector(request, {
      primary,
      logger: silentLogger,
    });
    expectProcedural(outcome, 'llm-parse-failed', 'llm-repair');
    expect(outcome.validation.firstTry[0]?.code).toBe('SCHEMA_INVALID');
    expect(outcome.firstTryRawText).toBe('not json');
  });

  it('records director-error instead of throwing on an unexpected failure', async () => {
    const primary: StructuredChat = {
      provider: 'google',
      model: 'gemini-3.8-flash',
      invokeStructured: () =>
        Promise.resolve({ parsed: JSON.parse(validJson) as unknown }),
    };
    const logger = {
      ...silentLogger,
      log: (message: string): void => {
        if (message.startsWith('director.plan_fixed')) {
          throw new Error('logger exploded');
        }
      },
    };
    const outcome = await runDirector(request, { primary, logger });
    expectProcedural(outcome, 'director-error', 'director');
  });

  it('never serves the repairPlan stub as an LLM plan for unparseable output', async () => {
    const primary: StructuredChat = {
      provider: 'google',
      model: 'gemini-3.8-flash',
      invokeStructured: () =>
        Promise.resolve({ parsed: null, raw: new AIMessage('not json') }),
    };
    const outcome = await runDirector(request, {
      primary,
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('procedural');
    expect(outcome.response.plan.title).not.toBe('Unrepaired');
    expect(outcome.validation.afterLocal).toEqual([
      { code: 'SCHEMA_INVALID', path: 'local:stub-plan' },
    ]);
  });

  it('repairs an unknown-surface piece locally (level-core repairRoute, stage repair-route)', async () => {
    const dirty: LevelPlan = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
    dirty.placements.push({
      id: 'p-ghost',
      piece: 'gem',
      surface: 'nope',
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: [],
    });
    const fake = new FakeListChatModel({ responses: [planToLlmJson(dirty)] });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('llm_repaired');
    expect(outcome.stage).toBe('repair-route');
    expect(outcome.response.repairs).toContain('repair-route');
    expect(outcome.repairedBy).toBe('local');
    expect(outcome.telemetry).toHaveLength(1);
  });
});

describe('runDirector DIRECTOR_PLACEMENT=slot', () => {
  const slots = listHintedSlots(request.graph, { seed });

  /** Pick a fitting, unused hinted slot per placement of the fixture plan. */
  function slotPlan(): { th: string; pl: Record<string, unknown>[] } {
    const used = new Set<string>();
    return {
      th: SYNTHETIC_LIVING_ROOM_PLAN.theme,
      pl: SYNTHETIC_LIVING_ROOM_PLAN.placements.map((placement) => {
        const pick =
          slots.find(
            (slot) =>
              !used.has(slot.id) &&
              slot.surfaceId === placement.surface &&
              slot.fits.includes(placement.piece)
          ) ??
          slots.find(
            (slot) => !used.has(slot.id) && slot.fits.includes(placement.piece)
          ) ??
          slots[0];
        if (pick === undefined) {
          throw new Error('fixture graph has no hinted slots');
        }
        used.add(pick.id);
        return {
          i: placement.id,
          pc: placement.piece,
          slot: pick.id,
          t: placement.to ?? null,
          lk: placement.links,
        };
      }),
    };
  }

  function capturing(
    responses: unknown[]
  ): {
    chat: StructuredChat;
    calls: { options?: StructuredCallOptions; user?: string }[];
  } {
    const calls: { options?: StructuredCallOptions; user?: string }[] = [];
    let index = 0;
    const chat: StructuredChat = {
      provider: 'google',
      model: 'gemini-3.8-flash',
      invokeStructured: (messages, _signal, options) => {
        const human = messages[1];
        calls.push({
          options,
          user:
            human instanceof HumanMessage && typeof human.content === 'string'
              ? human.content
              : undefined,
        });
        const parsed = responses[Math.min(index, responses.length - 1)];
        index += 1;
        return Promise.resolve({ parsed });
      },
    };
    return { chat, calls };
  }

  it('sends a per-request slot enum schema + hinted graph and resolves slots before validation', async () => {
    const plan = slotPlan();
    const { chat, calls } = capturing([plan, plan]);
    const outcome = await runDirector(request, {
      primary: chat,
      placement: 'slot',
      logger: silentLogger,
    });
    expect(outcome.placement).toBe('slot');
    const schema = calls[0]?.options?.responseSchema ?? {};
    const pl = (schema.properties ?? {}) as Record<
      string,
      { items?: { properties?: Record<string, unknown> } }
    >;
    const item = pl.pl?.items?.properties ?? {};
    expect(item.slot).toEqual({
      type: 'string',
      enum: hintedSlotIds(request.graph, { seed }),
    });
    expect(item.t).toEqual({ type: 'string', nullable: true });
    expect(JSON.stringify(schema)).not.toContain('pattern');

    const user = JSON.parse(calls[0]?.user ?? '{}') as {
      graph: { nodes: { slots?: { id: string }[] }[] };
    };
    const promptSlotIds = user.graph.nodes.flatMap(
      (node) => node.slots?.map((slot) => slot.id) ?? []
    );
    expect(promptSlotIds.sort()).toEqual(
      hintedSlotIds(request.graph, { seed }).sort()
    );

    // The candidate the rest of the pipeline saw is uv-shaped.
    const resolved = outcome.firstTryPlan as LevelPlanLLM;
    for (const [index, row] of resolved.pl.entries()) {
      const slotId = plan.pl[index]?.slot;
      const slot = slots.find((item) => item.id === slotId);
      expect(row).not.toHaveProperty('slot');
      expect(row.s).toBe(slot?.surfaceId);
      expect(row.u).toBe(slot?.u);
      expect(row.v).toBe(slot?.v);
    }
    // Client-facing plan keeps the unchanged LevelPlan shape.
    const parsed = LevelResponse.parse(outcome.response);
    for (const placement of parsed.plan.placements) {
      expect(placement).not.toHaveProperty('slot');
      expect(typeof placement.surface).toBe('string');
    }
    if (parsed.source === 'procedural') {
      expect(parsed.fallbackReason).toBeDefined();
    }
  });

  it('records slot-resolve-failed for unknown slot ids without a second call', async () => {
    const plan = slotPlan();
    const bad = {
      ...plan,
      pl: plan.pl.map((row, index) =>
        index === 0 ? { ...row, slot: 'zz-unknown' } : row
      ),
    };
    const { chat, calls } = capturing([bad]);
    const outcome = await runDirector(request, {
      primary: chat,
      placement: 'slot',
      logger: silentLogger,
    });
    expectProcedural(outcome, 'slot-resolve-failed', 'slot-resolve');
    expect(calls).toHaveLength(1);
  });

  it('keeps uv mode by default (no per-request schema, no slot hints)', async () => {
    const { chat, calls } = capturing([JSON.parse(validJson) as unknown]);
    const outcome = await runDirector(request, {
      primary: chat,
      logger: silentLogger,
    });
    expect(outcome.placement).toBe('uv');
    expect(calls[0]?.options).toBeUndefined();
    expect(calls[0]?.user).not.toContain('"slots"');
  });
});
