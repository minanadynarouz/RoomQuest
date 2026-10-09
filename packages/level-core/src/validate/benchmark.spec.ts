import { describe, it, expect } from 'vitest';
import type { SurfaceGraph } from '@roomquest/schema';
import { validatePlan } from './validate-plan';
import { GRAPH, PLAN } from './spec-helpers';

/**
 * Ticket B-03: < 2 ms per validation on a 12-node graph.
 * CI runners are noisy, so the assertion uses a generous 20 ms margin
 * while still recording the observed mean for the PR.
 */
function twelveNodeGraph(): SurfaceGraph {
  const nodes = [...GRAPH.nodes];
  const edges = [...GRAPH.edges];
  for (let i = 6; i <= 12; i += 1) {
    nodes.push({
      id: `s${String(i)}`,
      label: 'table',
      kind: 'plane',
      topHeight: 0.75,
      centroid: [i * 0.4, 0.75, 1],
      size: [0.6, 0.6],
      yaw: 0,
      area: 0.36,
      reach: 'ray',
      angleFromForward: 15,
    });
    edges.push({
      a: 's1',
      b: `s${String(i)}`,
      gap: 0.2,
      dh: 0,
      kind: 'adjacent',
    });
  }
  return { ...GRAPH, nodes, edges };
}

describe('validatePlan benchmark', () => {
  it('validates a 12-node graph in well under 20 ms (target < 2 ms)', () => {
    const graph = twelveNodeGraph();
    expect(graph.nodes).toHaveLength(12);

    // Warm the JIT / module graph.
    validatePlan(PLAN, graph);

    const iterations = 200;
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      const result = validatePlan(PLAN, graph);
      expect(result.ok).toBe(true);
    }
    const elapsed = performance.now() - start;
    const meanMs = elapsed / iterations;

    console.log(
      `validatePlan mean ${meanMs.toFixed(3)} ms over ${String(iterations)} runs on 12 nodes`
    );

    expect(meanMs).toBeLessThan(20);
  });
});
