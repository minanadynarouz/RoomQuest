import type { StructuredPlanCall } from './structured-chat';

/** Default delay before the route-arm hedge call (env DIRECTOR_HEDGE_MS). */
export const DEFAULT_DIRECTOR_HEDGE_MS = 3000;
/** DIRECTOR_HEDGE_MS for scripts (eval) that read process.env directly. */
export function resolveHedgeMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim().length === 0) {
    return DEFAULT_DIRECTOR_HEDGE_MS;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid DIRECTOR_HEDGE_MS "${raw}" (integer ms >= 0)`);
  }
  return value;
}

/** Skip the hedge once this share of LLM_DAILY_MAX is used. */
export const HEDGE_DAILY_CAP_FRACTION = 0.8;

export type HedgeRole = 'first' | 'second';

export type HedgeSkipReason =
  | 'disabled'
  | 'quota-breaker'
  | 'near-daily-cap'
  | 'daily-capped'
  | 'usage-unavailable'
  | 'deadline';

/** Reservation of one extra LLM_DAILY_MAX slot for the hedge call. */
export type HedgeReserveResult =
  | { ok: true }
  | { ok: false; reason: HedgeSkipReason };

export interface HedgeOptions {
  /** Fire the hedge when the first call is still pending after this. 0 = off. */
  delayMs: number;
  /** True while the quota circuit breaker is open (skip the hedge). */
  breakerOpen?: () => boolean;
  /**
   * Reserve a daily-usage slot before firing (also enforces the 80 % rule).
   * Omitted (tests / eval without a counter): always ok.
   */
  reserve?: () => Promise<HedgeReserveResult>;
}

export type HedgeCallOutcome = 'ok' | 'unusable' | 'error' | 'aborted';

export interface HedgeCallRecord {
  role: HedgeRole;
  startedMs: number;
  endedMs: number | null;
  outcome: HedgeCallOutcome | null;
  call?: StructuredPlanCall;
  error?: unknown;
}

export interface HedgeTrace {
  hedgeFired: boolean;
  hedgeWinner: HedgeRole | null;
  hedgeSkippedReason: HedgeSkipReason | null;
}

export interface HedgedResult extends HedgeTrace {
  /** Usable call (winner), or the last unusable call when none was usable. */
  call?: StructuredPlanCall;
  /** Role of `call`. */
  callRole: HedgeRole | null;
  /** Error to classify when no call returned at all. */
  error?: unknown;
  calls: HedgeCallRecord[];
}

/** Resolve after `ms`, or immediately when `signal` aborts. Never rejects. */
function waitOrAbort(ms: number, signal: AbortSignal): Promise<'timer' | 'abort'> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve('abort');
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve('abort');
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve('timer');
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Hedged request: start `invoke`; if it has not settled after
 * `opts.delayMs`, fire one identical second call. Each call has its own
 * AbortController and receives `AbortSignal.any([deadline, own])`, so
 * cancelling the loser aborts only that call, never the shared deadline
 * (which still bounds both). The first usable result wins; a fast failure
 * of the first call before the hedge time returns without hedging.
 */
export async function hedgedInvoke(
  invoke: (signal: AbortSignal) => Promise<StructuredPlanCall>,
  deadline: AbortSignal,
  opts: HedgeOptions,
  isUsable: (call: StructuredPlanCall) => boolean,
  now: () => number
): Promise<HedgedResult> {
  const calls: HedgeCallRecord[] = [];
  const controllers: AbortController[] = [];
  let settledCount = 0;
  let winner: HedgeCallRecord | undefined;
  let lastUnusable: HedgeCallRecord | undefined;
  let notify: (() => void) | undefined;

  const start = (role: HedgeRole): void => {
    const own = new AbortController();
    controllers.push(own);
    const rec: HedgeCallRecord = {
      role,
      startedMs: now(),
      endedMs: null,
      outcome: null,
    };
    calls.push(rec);
    const signal = AbortSignal.any([deadline, own.signal]);
    void invoke(signal).then(
      (call) => {
        if (rec.outcome === 'aborted') return;
        rec.endedMs = now();
        rec.call = call;
        if (isUsable(call)) {
          rec.outcome = 'ok';
          winner ??= rec;
        } else {
          rec.outcome = 'unusable';
          lastUnusable = rec;
        }
        settledCount += 1;
        notify?.();
      },
      (error: unknown) => {
        if (rec.outcome === 'aborted') return;
        rec.endedMs = now();
        rec.error = error;
        rec.outcome = own.signal.aborted && !deadline.aborted ? 'aborted' : 'error';
        settledCount += 1;
        notify?.();
      }
    );
  };

  /** Wait until a winner exists or every started call settled. */
  const untilDecided = async (): Promise<void> => {
    while (winner === undefined && settledCount < calls.length) {
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
      notify = undefined;
    }
  };

  // Re-read live state after awaits (avoid stale control-flow narrowing).
  const deadlineHit = (): boolean => deadline.aborted;
  const firstPending = (): boolean => settledCount === 0;

  let hedgeFired = false;
  let hedgeSkippedReason: HedgeSkipReason | null = null;

  start('first');
  if (opts.delayMs <= 0) {
    hedgeSkippedReason = 'disabled';
  } else {
    const timerAbort = new AbortController();
    const firstSettled = new Promise<'settled'>((resolve) => {
      const check = (): void => {
        if (settledCount > 0) resolve('settled');
      };
      const prev = notify;
      notify = () => {
        prev?.();
        check();
      };
    });
    const raced = await Promise.race([
      firstSettled,
      waitOrAbort(opts.delayMs, AbortSignal.any([deadline, timerAbort.signal])),
    ]);
    timerAbort.abort();
    notify = undefined;
    if (raced === 'timer' && settledCount === 0) {
      if (opts.breakerOpen?.() === true) {
        hedgeSkippedReason = 'quota-breaker';
      } else if (deadline.aborted) {
        hedgeSkippedReason = 'deadline';
      } else {
        const reserved = opts.reserve === undefined ? { ok: true as const } : await opts.reserve();
        if (!reserved.ok) {
          hedgeSkippedReason = reserved.reason;
        } else if (deadlineHit()) {
          hedgeSkippedReason = 'deadline';
        } else if (firstPending()) {
          hedgeFired = true;
          start('second');
        }
      }
    } else if (raced === 'abort' && settledCount === 0) {
      hedgeSkippedReason = 'deadline';
    }
  }

  await untilDecided();

  if (winner !== undefined) {
    // Cancel every other in-flight call through its own controller only.
    calls.forEach((rec, i) => {
      if (rec !== winner && rec.outcome === null) {
        // Record the loser's duration at cancel time, then abort it.
        rec.endedMs = now();
        rec.outcome = 'aborted';
        controllers[i]?.abort();
      }
    });
  }
  const chosen = winner ?? lastUnusable;
  const failed = calls.find((rec) => rec.outcome === 'error');
  return {
    hedgeFired,
    hedgeWinner: hedgeFired && winner !== undefined ? winner.role : null,
    hedgeSkippedReason,
    call: chosen?.call,
    callRole: chosen?.role ?? null,
    ...(chosen === undefined ? { error: (failed ?? calls[0])?.error } : {}),
    calls,
  };
}
