import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDirectorDeadline, type DirectorDeadline } from './deadline';
import {
  DIRECTOR_BUDGET_MS,
  DIRECTOR_LLM_WINDOW_MS,
  LLM_REPAIR_MIN_REMAINING_MS,
  PROCEDURAL_RESERVE_MS,
} from './director.constants';
import { useDirectorFakeTimers } from './test-clock';

describe('createDirectorDeadline', () => {
  const deadlines: DirectorDeadline[] = [];

  afterEach(() => {
    for (const deadline of deadlines) {
      deadline.dispose();
    }
    deadlines.length = 0;
  });

  function tracked(
    options: Parameters<typeof createDirectorDeadline>[0]
  ): DirectorDeadline {
    const deadline = createDirectorDeadline(options);
    deadlines.push(deadline);
    return deadline;
  }

  it('subtracts the procedural reserve from remaining LLM time', () => {
    let t = 1000;
    const deadline = tracked({
      budgetMs: DIRECTOR_BUDGET_MS,
      proceduralReserveMs: PROCEDURAL_RESERVE_MS,
      now: () => t,
      startedMs: 1000,
    });
    expect(deadline.remainingMs()).toBe(DIRECTOR_BUDGET_MS);
    expect(deadline.remainingForLlm()).toBe(DIRECTOR_LLM_WINDOW_MS);
    t = 5000;
    expect(deadline.remainingMs()).toBe(3000);
    expect(deadline.remainingForLlm()).toBe(2750);
    expect(deadline.canStartLlm(3000)).toBe(false);
    expect(deadline.canStartLlm(LLM_REPAIR_MIN_REMAINING_MS)).toBe(true);
  });

  describe('abort timer', () => {
    useDirectorFakeTimers();

    it('aborts LLM work 250 ms before the 7 s whole-request deadline', async () => {
      const deadline = tracked({});
      expect(deadline.signal.aborted).toBe(false);
      expect(deadline.remainingMs()).toBe(DIRECTOR_BUDGET_MS);
      expect(deadline.remainingForLlm()).toBe(DIRECTOR_LLM_WINDOW_MS);

      const aborted = new Promise<void>((resolve) => {
        deadline.signal.addEventListener('abort', () => {
          resolve();
        });
      });

      await vi.advanceTimersByTimeAsync(DIRECTOR_LLM_WINDOW_MS - 1);
      expect(deadline.signal.aborted).toBe(false);
      expect(deadline.canStartLlm(1)).toBe(true);
      expect(deadline.remainingMs()).toBe(PROCEDURAL_RESERVE_MS + 1);
      expect(deadline.remainingForLlm()).toBe(1);

      await vi.advanceTimersByTimeAsync(1);
      await aborted;
      expect(deadline.signal.aborted).toBe(true);
      expect(deadline.canStartLlm(1)).toBe(false);
      expect(deadline.remainingForLlm()).toBe(0);
      expect(deadline.remainingMs()).toBe(PROCEDURAL_RESERVE_MS);
    });
  });
});
