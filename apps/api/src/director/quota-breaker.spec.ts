import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { LevelRequest, LevelResponse } from '@roomquest/schema';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LLM_QUOTA_COOLDOWN_S,
  isQuotaError,
  LlmQuotaBreaker,
  quotaCooldownMs,
} from './quota-breaker';
import { runDirector } from './run-director';
import type { StructuredChat } from './structured-chat';
import type { DirectorLogger } from './telemetry';
import { useDirectorFakeTimers } from './test-clock';
import { planToLlmJson, silentLogger } from './test-fakes';

const request = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-10-14',
  tier: 'easy',
});

const validParsed = JSON.parse(planToLlmJson(SYNTHETIC_LIVING_ROOM_PLAN)) as unknown;

function quotaError(options?: {
  status?: number | string;
  message?: string;
  retryDelay?: string;
  retryAfterS?: string;
}): Error {
  const err = new Error(
    options?.message ?? '[429 Too Many Requests] RESOURCE_EXHAUSTED'
  ) as Error & {
    status?: number | string;
    errorDetails?: unknown[];
    headers?: { get: (name: string) => string | null };
  };
  err.status = options?.status ?? 429;
  if (options?.retryDelay !== undefined) {
    err.errorDetails = [
      {
        '@type': 'type.googleapis.com/google.rpc.RetryInfo',
        retryDelay: options.retryDelay,
      },
    ];
  }
  if (options?.retryAfterS !== undefined) {
    const header = options.retryAfterS;
    err.headers = {
      get: (name: string) =>
        name.toLowerCase() === 'retry-after' ? header : null,
    };
  }
  return err;
}

function mockGemini(
  invoke: StructuredChat['invokeStructured']
): StructuredChat {
  return {
    provider: 'google',
    model: 'gemini-3.8-flash',
    invokeStructured: invoke,
  };
}

function spyLogger(): {
  logger: DirectorLogger;
  log: ReturnType<typeof vi.fn<(message: string) => void>>;
  warn: ReturnType<typeof vi.fn<(message: string) => void>>;
} {
  const log = vi.fn<(message: string) => void>();
  const warn = vi.fn<(message: string) => void>();
  return {
    logger: {
      log,
      warn,
      debug: vi.fn<(message: string) => void>(),
    },
    log,
    warn,
  };
}

describe('isQuotaError', () => {
  it('detects HTTP 429', () => {
    expect(isQuotaError(quotaError({ status: 429 }))).toBe(true);
  });

  it('detects RESOURCE_EXHAUSTED status', () => {
    const err = new Error('quota');
    Object.assign(err, { status: 'RESOURCE_EXHAUSTED' });
    expect(isQuotaError(err)).toBe(true);
  });

  it('ignores ordinary provider errors', () => {
    expect(isQuotaError(new Error('gemini down'))).toBe(false);
  });
});

describe('quotaCooldownMs', () => {
  const fallbackMs = DEFAULT_LLM_QUOTA_COOLDOWN_S * 1000;

  it('reads retryDelay duration strings', () => {
    expect(quotaCooldownMs(quotaError({ retryDelay: '32s' }), fallbackMs)).toBe(
      32_000
    );
  });

  it('reads Retry-After seconds', () => {
    expect(
      quotaCooldownMs(quotaError({ retryAfterS: '120' }), fallbackMs)
    ).toBe(120_000);
  });

  it('falls back when the error has no retry hint', () => {
    expect(quotaCooldownMs(quotaError(), fallbackMs)).toBe(fallbackMs);
  });
});

describe('LlmQuotaBreaker with runDirector', () => {
  useDirectorFakeTimers();

  it('opens on 429, skips Gemini while open, and closes after the default cooldown', async () => {
    const { logger, log, warn } = spyLogger();
    const breaker = new LlmQuotaBreaker({ logger });
    const invoke = vi.fn<StructuredChat['invokeStructured']>();
    invoke.mockRejectedValueOnce(quotaError());
    invoke.mockResolvedValue({ parsed: validParsed });

    const first = await runDirector(request, {
      primary: mockGemini(invoke),
      logger: silentLogger,
      quotaBreaker: breaker,
    });
    expect(LevelResponse.parse(first.response).source).toBe('procedural');
    expect(first.response.fallbackReason).toBe('llm-quota');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe(
      `director.quota_breaker open cooldownMs=${String(DEFAULT_LLM_QUOTA_COOLDOWN_S * 1000)}`
    );
    expect(log).not.toHaveBeenCalled();

    const second = await runDirector(request, {
      primary: mockGemini(invoke),
      logger: silentLogger,
      quotaBreaker: breaker,
    });
    expect(second.response.source).toBe('procedural');
    expect(second.response.fallbackReason).toBe('llm-quota');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(DEFAULT_LLM_QUOTA_COOLDOWN_S * 1000 - 1);
    const stillOpen = await runDirector(request, {
      primary: mockGemini(invoke),
      logger: silentLogger,
      quotaBreaker: breaker,
    });
    expect(stillOpen.response.fallbackReason).toBe('llm-quota');
    expect(invoke).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    const afterClose = await runDirector(request, {
      primary: mockGemini(invoke),
      logger: silentLogger,
      quotaBreaker: breaker,
    });
    expect(afterClose.response.source).toBe('llm');
    expect(afterClose.response.fallbackReason).toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toBe('director.quota_breaker close');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('honours retryDelay from the quota error', async () => {
    const { logger, log, warn } = spyLogger();
    const breaker = new LlmQuotaBreaker({
      defaultCooldownMs: DEFAULT_LLM_QUOTA_COOLDOWN_S * 1000,
      logger,
    });
    const invoke = vi.fn<StructuredChat['invokeStructured']>();
    invoke.mockRejectedValueOnce(quotaError({ retryDelay: '32s' }));
    invoke.mockResolvedValue({ parsed: validParsed });

    const first = await runDirector(request, {
      primary: mockGemini(invoke),
      logger: silentLogger,
      quotaBreaker: breaker,
    });
    expect(first.response.fallbackReason).toBe('llm-quota');
    expect(warn.mock.calls[0]?.[0]).toBe(
      'director.quota_breaker open cooldownMs=32000'
    );

    vi.advanceTimersByTime(31_999);
    const stillOpen = await runDirector(request, {
      primary: mockGemini(invoke),
      logger: silentLogger,
      quotaBreaker: breaker,
    });
    expect(stillOpen.response.fallbackReason).toBe('llm-quota');
    expect(invoke).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    const afterDelay = await runDirector(request, {
      primary: mockGemini(invoke),
      logger: silentLogger,
      quotaBreaker: breaker,
    });
    expect(afterDelay.response.source).toBe('llm');
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
  });
});
