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
    ttftMs: null,
    distinctSurfaces: 0,
    distinctPieceTypes: 0,
    pieceTypes: [],
    surfaceLabels: [],
    issuesFirstTry: [],
    issuesAfterLocal: null,
    issuesAfterLlmRepair: null,
    repairedBy: null,
    placement: 'uv',
    requestedPlacement: 'uv',
    fallbackReason: 'llm-invalid',
    stage: 'procedural',
    failedAt: 'llm-repair-gate',
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

  it('reports relaxed % per placement arm and counts reasons/stages', () => {
    const aggregate = aggregateRuns([
      run(['hutTable']),
      { ...run([]), placement: 'slot', requestedPlacement: 'slot' },
      {
        ...run(['minPath']),
        placement: 'slot',
        requestedPlacement: 'slot',
        source: 'llm',
        fallbackReason: 'none',
        stage: 'snap',
        failedAt: null,
      },
    ]);
    expect(aggregate.relaxedPctByPlacement).toEqual({
      uv: { minPath: 0, hutTable: 100, portalFov: 0 },
      slot: { minPath: 50, hutTable: 0, portalFov: 0 },
    });
    expect(aggregate.fallbackReasonCounts).toEqual({
      'llm-invalid': 2,
      none: 1,
    });
    expect(aggregate.stageCounts).toEqual({ procedural: 2, snap: 1 });
    expect(aggregate.failedAtCounts).toEqual({
      'llm-repair-gate': 2,
      none: 1,
    });
  });
});
