import { describe, expect, it } from 'vitest';
import { aggregateRuns, type EvalRunRecord } from './report';

function run(relaxed: EvalRunRecord['relaxed']): EvalRunRecord {
  return {
    roomId: 'living_room',
    roomHash: 'aaaaaaaaaaaa',
    date: '2026-10-10',
    seed: 'aaaaaaaaaaaa-2026-10-10',
    tier: 'easy',
    source: 'procedural',
    validBeforeRepair: false,
    validAfterRepair: false,
    fallbackToProcedural: true,
    latencyMs: 10,
    repairs: [],
    relaxed,
    estimatedCostUsd: 0,
    telemetry: [],
  };
}

describe('eval aggregate relaxedPct', () => {
  it('reports percent of runs per waiver id', () => {
    const aggregate = aggregateRuns([
      run(['hutTable', 'portalFov']),
      run(['hutTable']),
      run([]),
      run(['minPath']),
    ]);
    expect(aggregate.relaxedPct).toEqual({
      minPath: 25,
      hutTable: 50,
      portalFov: 25,
    });
  });

  it('is zero when no run applied a waiver', () => {
    expect(aggregateRuns([run([])]).relaxedPct).toEqual({
      minPath: 0,
      hutTable: 0,
      portalFov: 0,
    });
  });
});
