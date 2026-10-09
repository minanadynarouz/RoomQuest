import { afterEach, describe, expect, it } from 'vitest';
import { createDirectorDeadline, type DirectorDeadline } from './deadline';

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
      budgetMs: 7000,
      proceduralReserveMs: 250,
      now: () => t,
      startedMs: 1000,
    });
    expect(deadline.remainingMs()).toBe(7000);
    expect(deadline.remainingForLlm()).toBe(6750);
    t = 5000;
    expect(deadline.remainingMs()).toBe(3000);
    expect(deadline.remainingForLlm()).toBe(2750);
    expect(deadline.canStartLlm(3000)).toBe(false);
    expect(deadline.canStartLlm(2000)).toBe(true);
  });

  it('aborts LLM work at budget minus reserve so generatePlan still fits', async () => {
    const deadline = tracked({
      budgetMs: 40,
      proceduralReserveMs: 10,
    });
    expect(deadline.signal.aborted).toBe(false);
    await new Promise<void>((resolve) => {
      deadline.signal.addEventListener('abort', () => {
        resolve();
      });
    });
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.canStartLlm(1)).toBe(false);
  });
});
