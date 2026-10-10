import { describe, expect, it } from 'vitest';
import { aggregateRuns, type EvalRunRecord } from './report';

function run(
  extras: Partial<EvalRunRecord> & { relaxed: EvalRunRecord['relaxed'] }
): EvalRunRecord {
  return {
    roomId: 'living_room',
    roomHash: 'aaaaaaaaaaaa',
    date: '2026-10-10',
    seed: 'aaaaaaaaaaaa-2026-10-10',
    tier: 'easy',
    placement: 'uv',
    source: 'procedural',
    validBeforeRepair: false,
    validAfterRepair: false,
    fallbackToProcedural: true,
    latencyMs: 10,
    ttftMs: null,
    repairs: [],
    fallbackReason: 'llm-invalid',
    fallbackStage: 'local',
    estimatedCostUsd: 0,
    telemetry: [],
    distinctSurfaces: 1,
    distinctPieceTypes: 1,
    pieceTypes: ['village_hut'],
    surfaceLabels: ['table'],
    issuesFirstTry: [],
    issuesAfterLocal: [],
    issuesAfterLlmRepair: null,
    repairedBy: null,
    ...extras,
  };
}

describe('eval aggregate relaxedPct', () => {
  it('reports percent of runs per waiver id', () => {
    const aggregate = aggregateRuns([
      run({ relaxed: ['hutTable', 'portalFov'] }),
      run({ relaxed: ['hutTable'] }),
      run({ relaxed: [] }),
      run({ relaxed: ['minPath'] }),
    ]);
    expect(aggregate.relaxedPct).toEqual({
      minPath: 25,
      hutTable: 50,
      portalFov: 25,
    });
    expect(aggregate.fallbackReasonCounts['llm-invalid']).toBe(4);
  });

  it('is zero when no run applied a waiver', () => {
    expect(aggregateRuns([run({ relaxed: [] })]).relaxedPct).toEqual({
      minPath: 0,
      hutTable: 0,
      portalFov: 0,
    });
  });
});
