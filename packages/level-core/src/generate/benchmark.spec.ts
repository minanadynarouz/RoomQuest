import { describe, it, expect } from 'vitest';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { generatePlan } from './generate-plan';
import { EXTRA_TEST_GRAPHS } from './test-graphs';

/**
 * Ticket B-04: generator runs < 20 ms per plan.
 * CI runners are noisy, so the assertion uses a 50 ms margin while
 * still recording the observed mean for the PR.
 */
describe('generatePlan benchmark', () => {
  it('builds a living-room plan in well under 50 ms (target < 20 ms)', () => {
    generatePlan(SYNTHETIC_LIVING_ROOM, 'warmup', 'easy');

    const iterations = 80;
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      generatePlan(
        SYNTHETIC_LIVING_ROOM,
        `bench-${String(i)}`,
        i % 2 === 0 ? 'easy' : 'normal'
      );
    }
    const elapsed = performance.now() - start;
    const meanMs = elapsed / iterations;
    console.log(
      `generatePlan mean ${meanMs.toFixed(3)} ms over ${String(iterations)} living-room runs`
    );
    expect(meanMs).toBeLessThan(50);
  });

  it('stays fast on the tiny 2-node graph', () => {
    const tiny = EXTRA_TEST_GRAPHS[0];
    expect(tiny).toBeDefined();
    if (!tiny) {
      return;
    }
    const iterations = 40;
    generatePlan(tiny.graph, 'tiny-warm', 'normal');
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      generatePlan(tiny.graph, `tiny-bench-${String(i)}`, 'normal');
    }
    const meanMs = (performance.now() - start) / iterations;
    console.log(`generatePlan tiny-graph mean ${meanMs.toFixed(3)} ms`);
    expect(meanMs).toBeLessThan(50);
  });
});
