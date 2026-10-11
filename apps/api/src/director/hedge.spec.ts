import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import { candidateRoutes } from '@roomquest/level-core';
import { LevelRequest } from '@roomquest/schema';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { validateEnv } from '../config/env';
import { makeDailySeed } from '../levels/daily-seed';
import type { LlmDailyUsage } from './daily-usage';
import { DirectorService } from './director.service';
import { DirectorTimeoutError } from './errors';
import {
  DEFAULT_DIRECTOR_HEDGE_MS,
  hedgedInvoke,
  resolveHedgeMs,
  type HedgeOptions,
} from './hedge';
import type { DirectorChatFactory } from './models';
import { runDirector } from './run-director';
import type { StructuredChat, StructuredPlanCall } from './structured-chat';
import { cachedTokensFromRaw, tokensFromRaw } from './telemetry';
import { settleWithDirectorFakeTime, useDirectorFakeTimers } from './test-clock';
import { mockDecorationJson, silentLogger } from './test-fakes';

const DEADLINE_MS = 6750;

/** A fake call that resolves after `ms` (or never), rejecting on abort. */
function fakeCall(
  ms: number | null,
  result: StructuredPlanCall | Error = { parsed: { ok: true } }
): (signal: AbortSignal) => Promise<StructuredPlanCall> {
  return (signal) =>
    new Promise((resolve, reject) => {
      const onAbort = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        reject(new DirectorTimeoutError());
      };
      const timer =
        ms === null
          ? undefined
          : setTimeout(() => {
              signal.removeEventListener('abort', onAbort);
              if (result instanceof Error) reject(result);
              else resolve(result);
            }, ms);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });
}

interface Harness {
  invoke: (signal: AbortSignal) => Promise<StructuredPlanCall>;
  signals: AbortSignal[];
  calls: number;
}

function sequence(
  ...impls: ((signal: AbortSignal) => Promise<StructuredPlanCall>)[]
): Harness {
  const h: Harness = {
    signals: [],
    calls: 0,
    invoke: (signal) => {
      h.signals.push(signal);
      const impl = impls[h.calls] ?? impls[impls.length - 1];
      h.calls += 1;
      if (impl === undefined) throw new Error('no impl');
      return impl(signal);
    },
  };
  return h;
}

function deadlineIn(ms: number): AbortController {
  const c = new AbortController();
  setTimeout(() => {
    c.abort();
  }, ms);
  return c;
}

const usable = (call: StructuredPlanCall): boolean =>
  call.parsed !== undefined && call.parsed !== null;

async function run(h: Harness, opts: HedgeOptions, deadline = deadlineIn(DEADLINE_MS)) {
  const result = await settleWithDirectorFakeTime(
    hedgedInvoke(h.invoke, deadline.signal, opts, usable, () => Date.now()),
    DEADLINE_MS + 1000
  );
  return { result, deadline };
}

describe('hedgedInvoke (fake timers)', () => {
  useDirectorFakeTimers();

  it('stalled first call → hedge fires and wins; first aborted via its own controller', async () => {
    const h = sequence(fakeCall(null), fakeCall(500, { parsed: { who: 2 } }));
    const reserve = vi.fn(() => Promise.resolve({ ok: true as const }));
    const { result, deadline } = await run(h, { delayMs: 3000, reserve });
    expect(h.calls).toBe(2);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(result.hedgeFired).toBe(true);
    expect(result.hedgeWinner).toBe('second');
    expect(result.call?.parsed).toEqual({ who: 2 });
    expect(h.signals[0]?.aborted).toBe(true);
    expect(h.signals[1]?.aborted).toBe(false);
    expect(deadline.signal.aborted).toBe(false);
    const [first, second] = result.calls;
    expect(first?.outcome).toBe('aborted');
    expect(second?.outcome).toBe('ok');
    expect(second?.startedMs).toBe(3000);
    expect((second?.endedMs ?? 0) - (second?.startedMs ?? 0)).toBe(500);
    expect((first?.endedMs ?? 0) - (first?.startedMs ?? 0)).toBe(3500);
  });

  it('first returns before hedge time → no hedge', async () => {
    const h = sequence(fakeCall(1000), fakeCall(10));
    const reserve = vi.fn(() => Promise.resolve({ ok: true as const }));
    const { result } = await run(h, { delayMs: 3000, reserve });
    expect(h.calls).toBe(1);
    expect(reserve).not.toHaveBeenCalled();
    expect(result.hedgeFired).toBe(false);
    expect(result.hedgeWinner).toBeNull();
    expect(result.hedgeSkippedReason).toBeNull();
    expect(result.callRole).toBe('first');
  });

  it('first wins after the hedge fired → second aborted, winner not aborted, deadline intact', async () => {
    const h = sequence(fakeCall(4000, { parsed: { who: 1 } }), fakeCall(3000));
    const { result, deadline } = await run(h, { delayMs: 3000 });
    expect(result.hedgeFired).toBe(true);
    expect(result.hedgeWinner).toBe('first');
    expect(result.call?.parsed).toEqual({ who: 1 });
    // Aborting the loser must not abort the winner or the shared deadline.
    expect(h.signals[1]?.aborted).toBe(true);
    expect(h.signals[0]?.aborted).toBe(false);
    expect(deadline.signal.aborted).toBe(false);
    expect(result.calls.map((c) => c.outcome)).toEqual(['ok', 'aborted']);
    expect(result.calls.map((c) => (c.endedMs ?? 0) - c.startedMs)).toEqual([4000, 1000]);
  });

  it('first fails fast before hedge time → no hedge, error returned', async () => {
    const h = sequence(fakeCall(100, new Error('boom')), fakeCall(10));
    const { result } = await run(h, { delayMs: 3000 });
    expect(h.calls).toBe(1);
    expect(result.hedgeFired).toBe(false);
    expect(result.call).toBeUndefined();
    expect((result.error as Error).message).toBe('boom');
  });

  it('skips the hedge when the reservation reports >= 80% of the daily cap', async () => {
    const h = sequence(fakeCall(4000), fakeCall(10));
    const { result } = await run(h, {
      delayMs: 3000,
      reserve: () => Promise.resolve({ ok: false, reason: 'near-daily-cap' }),
    });
    expect(h.calls).toBe(1);
    expect(result.hedgeFired).toBe(false);
    expect(result.hedgeSkippedReason).toBe('near-daily-cap');
    expect(result.callRole).toBe('first');
  });

  it('skips the hedge while the quota breaker is open (no reservation)', async () => {
    const h = sequence(fakeCall(4000), fakeCall(10));
    const reserve = vi.fn(() => Promise.resolve({ ok: true as const }));
    const { result } = await run(h, { delayMs: 3000, breakerOpen: () => true, reserve });
    expect(h.calls).toBe(1);
    expect(reserve).not.toHaveBeenCalled();
    expect(result.hedgeSkippedReason).toBe('quota-breaker');
  });

  it('delayMs 0 disables hedging', async () => {
    const h = sequence(fakeCall(5000), fakeCall(10));
    const { result } = await run(h, { delayMs: 0 });
    expect(h.calls).toBe(1);
    expect(result.hedgeSkippedReason).toBe('disabled');
  });

  it('respects the shared deadline: both stall → both end at the deadline, no extension', async () => {
    const h = sequence(fakeCall(null), fakeCall(null));
    const { result, deadline } = await run(h, { delayMs: 3000 });
    expect(deadline.signal.aborted).toBe(true);
    expect(result.hedgeFired).toBe(true);
    expect(result.call).toBeUndefined();
    expect(result.calls.map((c) => c.endedMs)).toEqual([DEADLINE_MS, DEADLINE_MS]);
    expect(result.calls.map((c) => c.outcome)).toEqual(['error', 'error']);
  });
});

/** Fake LlmDailyUsage: counts consumes. */
function fakeUsage(used: number, max = 150) {
  const state = { used, consumes: 0 };
  const usage = {
    snapshot: () => Promise.resolve({ used: state.used, max, failClosed: false }),
    consume: () => {
      state.consumes += 1;
      if (state.used >= max) return Promise.resolve('capped' as const);
      state.used += 1;
      return Promise.resolve('ok' as const);
    },
  };
  return { state, usage: usage as unknown as LlmDailyUsage };
}

function serviceWith(usage: LlmDailyUsage): DirectorService {
  const env = validateEnv({});
  const config = {
    get: (key: keyof Env) => env[key],
  } as unknown as ConfigService<Env, true>;
  const factory: DirectorChatFactory = { createPrimary: vi.fn() };
  return new DirectorService(config, factory, undefined, usage);
}

describe('DirectorService.reserveHedgeSlot', () => {
  it('reserves (consumes) a slot below 80% of the cap', async () => {
    const { state, usage } = fakeUsage(10);
    await expect(serviceWith(usage).reserveHedgeSlot()).resolves.toEqual({ ok: true });
    expect(state.consumes).toBe(1);
  });

  it('skips at >= 80% of the cap without consuming', async () => {
    const { state, usage } = fakeUsage(120);
    await expect(serviceWith(usage).reserveHedgeSlot()).resolves.toEqual({
      ok: false,
      reason: 'near-daily-cap',
    });
    expect(state.consumes).toBe(0);
  });

  it('defaults DIRECTOR_HEDGE_MS to 3000; 0 disables; blank → default', () => {
    expect(validateEnv({}).DIRECTOR_HEDGE_MS).toBe(3000);
    expect(validateEnv({ DIRECTOR_HEDGE_MS: '0' }).DIRECTOR_HEDGE_MS).toBe(0);
    expect(validateEnv({ DIRECTOR_HEDGE_MS: '' }).DIRECTOR_HEDGE_MS).toBe(3000);
    expect(resolveHedgeMs(undefined)).toBe(DEFAULT_DIRECTOR_HEDGE_MS);
    expect(resolveHedgeMs('1500')).toBe(1500);
  });
});

describe('route arm hedged decoration (runDirector, fake timers)', () => {
  useDirectorFakeTimers();

  const roomId = IWER_ROOM_IDS[0];
  const request = LevelRequest.parse({
    graph: IWER_GRAPHS[roomId],
    date: '2026-10-14',
    tier: 'easy',
  });
  const seed = makeDailySeed(request.graph.roomHash, request.date);

  function stallThenAnswer(answer: unknown): { chat: StructuredChat; signals: AbortSignal[] } {
    const signals: AbortSignal[] = [];
    const impls = [fakeCall(null), fakeCall(400, { parsed: answer })];
    return {
      signals,
      chat: {
        provider: 'google',
        model: 'gemini-3.8-flash',
        invokeStructured: (_messages, signal) => {
          signals.push(signal);
          const impl = impls[signals.length - 1];
          if (impl === undefined) throw new Error('unexpected third call');
          return impl(signal);
        },
      },
    };
  }

  it('stall → hedge wins; both calls counted in daily usage; per-call telemetry', async () => {
    const candidates = candidateRoutes(request.graph, { seed, tier: 'easy' });
    const answer = JSON.parse(mockDecorationJson(candidates)) as unknown;
    const { chat, signals } = stallThenAnswer(answer);
    const { state, usage } = fakeUsage(0);
    const service = serviceWith(usage);
    // The service reserves the first call before runDirector.
    expect(await usage.consume()).toBe('ok');
    const outcome = await settleWithDirectorFakeTime(
      runDirector(request, {
        primary: chat,
        placement: 'route',
        logger: silentLogger,
        hedge: { delayMs: 3000, reserve: () => service.reserveHedgeSlot() },
      }),
      8000
    );
    expect(state.consumes).toBe(2);
    expect(state.used).toBe(2);
    expect(outcome.response.source).toBe('llm');
    expect(outcome.hedge).toEqual({
      hedgeFired: true,
      hedgeWinner: 'second',
      hedgeSkippedReason: null,
    });
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    const rows = outcome.telemetry;
    expect(rows).toHaveLength(2);
    const first = rows.find((r) => r.hedgeRole === 'first');
    const second = rows.find((r) => r.hedgeRole === 'second');
    expect(first?.outcome).toBe('aborted');
    expect(first?.totalMs).toBe(3400);
    expect(first?.startOffsetMs).toBe(0);
    expect(second?.outcome).toBe('ok');
    expect(second?.startOffsetMs).toBe(3000);
    expect(second?.totalMs).toBe(400);
  });

  it('hedge skipped at >= 80% cap: one call, deadline still bounds it', async () => {
    const { chat } = stallThenAnswer({});
    const { state, usage } = fakeUsage(130);
    const service = serviceWith(usage);
    const outcome = await settleWithDirectorFakeTime(
      runDirector(request, {
        primary: chat,
        placement: 'route',
        logger: silentLogger,
        hedge: { delayMs: 3000, reserve: () => service.reserveHedgeSlot() },
      }),
      8000
    );
    expect(state.consumes).toBe(0);
    expect(outcome.hedge?.hedgeSkippedReason).toBe('near-daily-cap');
    expect(outcome.response.source).toBe('procedural');
    expect(outcome.response.fallbackReason).toBe('llm-timeout');
    expect(outcome.telemetry).toHaveLength(1);
    expect(outcome.telemetry[0]?.totalMs).toBeLessThanOrEqual(DEADLINE_MS);
  });
});

describe('cachedTokens', () => {
  it('reads usage_metadata.input_token_details.cache_read first', () => {
    const raw = {
      usage_metadata: { input_tokens: 900, input_token_details: { cache_read: 512 } },
      response_metadata: { usageMetadata: { cachedContentTokenCount: 1 } },
    };
    expect(cachedTokensFromRaw(raw)).toBe(512);
    expect(tokensFromRaw(raw).cachedTokens).toBe(512);
    expect(cachedTokensFromRaw({ usageMetadata: { inputTokenDetails: { cacheRead: 7 } } })).toBe(7);
  });

  it('falls back to response_metadata.usageMetadata.cachedContentTokenCount', () => {
    expect(
      cachedTokensFromRaw({
        usage_metadata: { input_tokens: 900 },
        response_metadata: { usageMetadata: { cachedContentTokenCount: 768 } },
      })
    ).toBe(768);
    expect(
      cachedTokensFromRaw({ response_metadata: { usage_metadata: { cached_content_token_count: 5 } } })
    ).toBe(5);
    expect(cachedTokensFromRaw({ parsed: {}, raw: { response_metadata: { usageMetadata: { cachedContentTokenCount: 3 } } } })).toBe(3);
    expect(cachedTokensFromRaw({ usage_metadata: { input_tokens: 1 } })).toBeNull();
  });
});
