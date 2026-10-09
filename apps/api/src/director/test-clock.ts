import { afterEach, beforeEach, vi } from 'vitest';
import { DIRECTOR_BUDGET_MS } from './director.constants';

/** Fake Date/setTimeout only so Promises, nextTick, and Nest HTTP keep working. */
const DIRECTOR_FAKE_TIMER_KEYS = [
  'Date',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
] as const;

export function installDirectorFakeTimers(): void {
  vi.useFakeTimers({
    now: 0,
    toFake: [...DIRECTOR_FAKE_TIMER_KEYS],
  });
}

export function useDirectorFakeTimers(): void {
  beforeEach(() => {
    installDirectorFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

/**
 * Advance simulated time until `work` settles, or `maxMs` of fake time elapses.
 * Used when the work (HTTP, async LLM fakes) schedules timers after yielding.
 */
export async function settleWithDirectorFakeTime<T>(
  work: PromiseLike<T>,
  maxMs: number = DIRECTOR_BUDGET_MS
): Promise<T> {
  const stepMs = 50;
  const resultPromise = Promise.resolve(work);
  for (let elapsed = 0; elapsed < maxMs; elapsed += stepMs) {
    const state = await Promise.race([
      resultPromise.then(() => 'done' as const),
      vi.advanceTimersByTimeAsync(stepMs).then(() => 'tick' as const),
    ]);
    if (state === 'done') {
      break;
    }
  }
  return resultPromise;
}
