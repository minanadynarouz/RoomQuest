import { FakeListChatModel } from '@langchain/core/utils/testing';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import * as levelCore from '@roomquest/level-core';
import { validatePlan } from '@roomquest/level-core';
import { LevelRequest, type LevelPlan } from '@roomquest/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localRepairPlan, repairRoute } from './local-repair';
import { runDirector } from './run-director';
import { planToLlmJson, silentLogger, structuredFromFake } from './test-fakes';

vi.mock('@roomquest/level-core', async (importOriginal) => {
  const actual = await importOriginal<typeof levelCore>();
  return { ...actual, repairRoute: vi.fn(actual.repairRoute) };
});

const level = vi.mocked(levelCore);

const request = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-10-14',
  tier: 'easy',
});

/** Unknown surface: snap cannot fix it, so repairRoute runs. */
function ghostPlan(): LevelPlan {
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
  return dirty;
}

function mockRouteResult(strategy: 'kept' | 'skeleton'): void {
  level.repairRoute.mockImplementationOnce(() => {
    const plan = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
    if (strategy === 'skeleton') {
      plan.title = 'Fresh skeleton';
    }
    return { plan, changed: true, issues: [], strategy };
  });
}

afterEach(() => {
  level.repairRoute.mockClear();
});

describe('repairRoute result gating (kept only)', () => {
  it('kept: accepts the rebuilt plan', () => {
    mockRouteResult('kept');
    const routed = repairRoute(ghostPlan(), SYNTHETIC_LIVING_ROOM, {
      seed: 's',
    });
    expect(routed.skeleton).toBe(false);
    expect(routed.repairs).toEqual(['repair-route']);
    expect(validatePlan(routed.plan, SYNTHETIC_LIVING_ROOM).ok).toBe(true);
  });

  it('skeleton: rejects the fresh plan and flags it', () => {
    mockRouteResult('skeleton');
    const input = ghostPlan();
    const routed = repairRoute(input, SYNTHETIC_LIVING_ROOM, { seed: 's' });
    expect(routed.skeleton).toBe(true);
    expect(routed.plan).toBe(input);
    expect(routed.repairs).toEqual([]);
  });

  it('localRepairPlan: skeleton stops local repair (no repairPlan rescue)', () => {
    mockRouteResult('skeleton');
    const out = localRepairPlan(ghostPlan(), SYNTHETIC_LIVING_ROOM);
    expect(out.ok).toBe(false);
    expect(out.fixedBy).toBeNull();
    expect(!out.ok && out.routeSkeleton).toBe(true);
    expect(out.plan).toBeUndefined();
  });

  it('director: kept -> llm_repaired, repairs include repair-route', async () => {
    mockRouteResult('kept');
    const fake = new FakeListChatModel({
      responses: [planToLlmJson(ghostPlan())],
    });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      logger: silentLogger,
    });
    expect(level.repairRoute).toHaveBeenCalled();
    expect(outcome.response.source).toBe('llm_repaired');
    expect(outcome.repairedBy).toBe('local');
    expect(outcome.stage).toBe('repair-route');
    expect(outcome.response.repairs).toContain('repair-route');
    expect(outcome.failedAt).toBeNull();
  });

  it('director: skeleton -> procedural, llm-invalid, failedAt repairRoute', async () => {
    mockRouteResult('skeleton');
    const fake = new FakeListChatModel({
      responses: [planToLlmJson(ghostPlan())],
    });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      logger: silentLogger,
    });
    expect(level.repairRoute).toHaveBeenCalled();
    expect(outcome.response.source).toBe('procedural');
    expect(outcome.response.fallbackReason).toBe('llm-invalid');
    expect(outcome.failedAt).toBe('repairRoute');
    expect(outcome.stage).toBe('procedural');
    expect(outcome.repairedBy).toBeNull();
    expect(outcome.response.plan.title).not.toBe('Fresh skeleton');
    expect(outcome.response.repairs).not.toContain('repair-route');
    expect(outcome.validation.afterLocal?.length).toBeGreaterThan(0);
    expect(outcome.telemetry).toHaveLength(1);
  });
});

describe('repairRoute skeleton with the real level-core', () => {
  it('a no-shrine plan that repairRoute can only replace goes procedural', async () => {
    const dirty: LevelPlan = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
    dirty.placements = dirty.placements.filter(
      (item) => item.piece !== 'crystal_shrine'
    );
    const fake = new FakeListChatModel({ responses: [planToLlmJson(dirty)] });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('procedural');
    expect(outcome.response.fallbackReason).toBe('llm-invalid');
    expect(outcome.failedAt).toBe('repairRoute');
  });
});
