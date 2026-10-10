import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LLM_DAILY_MAX, LlmDailyUsage, utcDayKey } from './daily-usage';
import { useDirectorFakeTimers } from './test-clock';

useDirectorFakeTimers();

interface FakeStore {
  counts: Map<string, number>;
}

function fakePrisma(
  options: {
    store?: FakeStore;
    max?: number;
    client?: object | null;
    query?: ReturnType<typeof vi.fn>;
  } = {}
): {
  prisma: { getClient: () => { $queryRaw: ReturnType<typeof vi.fn> } | null };
  store: FakeStore;
  queryRaw: ReturnType<typeof vi.fn>;
} {
  const store = options.store ?? { counts: new Map<string, number>() };
  const queryRaw =
    options.query ??
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('INSERT')) {
        const day = String(values[0]);
        const max = Number(values[1]);
        const current = store.counts.get(day) ?? 0;
        if (current >= max) {
          return [];
        }
        const next = current + 1;
        store.counts.set(day, next);
        return [{ count: next }];
      }
      if (sql.includes('SELECT')) {
        const day = String(values[0]);
        const current = store.counts.get(day);
        return current === undefined ? [] : [{ count: current }];
      }
      return [];
    });

  if (options.client === null) {
    return {
      prisma: { getClient: () => null },
      store,
      queryRaw,
    };
  }

  return {
    prisma: {
      getClient: () => ({ $queryRaw: queryRaw }),
    },
    store,
    queryRaw,
  };
}

describe('LlmDailyUsage', () => {
  beforeEach(() => {
    vi.setSystemTime(Date.UTC(2026, 9, 10, 12, 0, 0));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('defaults max to 150', () => {
    expect(DEFAULT_LLM_DAILY_MAX).toBe(150);
    expect(utcDayKey(Date.UTC(2026, 9, 10, 23, 59, 59))).toBe('2026-10-10');
    expect(utcDayKey(Date.UTC(2026, 9, 11, 0, 0, 0))).toBe('2026-10-11');
  });

  it('increments until the cap and then returns capped', async () => {
    const { prisma, store, queryRaw } = fakePrisma();
    const usage = new LlmDailyUsage({
      prisma: prisma as never,
      max: 2,
      now: () => Date.now(),
    });

    expect(await usage.consume()).toBe('ok');
    expect(await usage.consume()).toBe('ok');
    expect(await usage.consume()).toBe('capped');
    expect(await usage.consume()).toBe('capped');
    expect(store.counts.get('2026-10-10')).toBe(2);
    expect(queryRaw).toHaveBeenCalledTimes(4);
  });

  it('rolls over at UTC midnight with the injected clock', async () => {
    const { prisma, store } = fakePrisma();
    const usage = new LlmDailyUsage({
      prisma: prisma as never,
      max: 1,
      now: () => Date.now(),
    });

    expect(await usage.consume()).toBe('ok');
    expect(await usage.consume()).toBe('capped');

    vi.setSystemTime(Date.UTC(2026, 9, 11, 0, 0, 0));
    expect(await usage.consume()).toBe('ok');
    expect(store.counts.get('2026-10-10')).toBe(1);
    expect(store.counts.get('2026-10-11')).toBe(1);
    expect(await usage.today()).toEqual({ used: 1, max: 1 });
  });

  it('logs one warn the first time the cap is hit each UTC day', async () => {
    const { prisma } = fakePrisma();
    const warn = vi.fn<(message: string) => void>();
    const usage = new LlmDailyUsage({
      prisma: prisma as never,
      max: 1,
      now: () => Date.now(),
      logger: { warn },
    });

    expect(await usage.consume()).toBe('ok');
    expect(await usage.consume()).toBe('capped');
    expect(await usage.consume()).toBe('capped');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe(
      'director.llm_daily_cap reached day=2026-10-10 max=1'
    );

    vi.setSystemTime(Date.UTC(2026, 9, 11, 0, 0, 1));
    expect(await usage.consume()).toBe('ok');
    expect(await usage.consume()).toBe('capped');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]?.[0]).toBe(
      'director.llm_daily_cap reached day=2026-10-11 max=1'
    );
  });

  it('fails closed and logs once when the database client is missing', async () => {
    const { prisma, queryRaw } = fakePrisma({ client: null });
    const warn = vi.fn<(message: string) => void>();
    const usage = new LlmDailyUsage({
      prisma: prisma as never,
      max: 150,
      now: () => Date.now(),
      logger: { warn },
    });

    expect(await usage.consume()).toBe('unavailable');
    expect(await usage.consume()).toBe('unavailable');
    expect(await usage.snapshot()).toEqual({
      used: 0,
      max: 150,
      failClosed: true,
    });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(
      /director\.llm_daily_cap unavailable; skipping live Gemini \(DATABASE_URL is unset\)/
    );
  });

  it('fails closed and logs once when the query throws', async () => {
    const query = vi.fn(() => Promise.reject(new Error('connection refused')));
    const { prisma } = fakePrisma({ query });
    const warn = vi.fn<(message: string) => void>();
    const usage = new LlmDailyUsage({
      prisma: prisma as never,
      now: () => Date.now(),
      logger: { warn },
    });

    expect(await usage.consume()).toBe('unavailable');
    expect(await usage.consume()).toBe('unavailable');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/connection refused/);
  });
});
