import { PlanSource, Tier } from '@roomquest/schema';
import { z } from 'zod';
import { EVAL_BAR_P95_MS, EVAL_BAR_VALID_AFTER_REPAIR_PCT } from './constants';
import { priceForModel } from './prices';
import { meanPairwiseJaccard, unionSetsByRoom } from './variety';

const LlmCallTelemetrySchema = z.object({
  provider: z.enum(['google']),
  model: z.string(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  thinkingTokens: z.number().nullable(),
  thoughtsTokenCount: z.number().nullable(),
  latencyMs: z.number(),
  ttftMs: z.number().nullable(),
  outcome: z.enum(['ok', 'invalid', 'repaired', 'timeout', 'error']),
});

const IssueTraceSchema = z.object({
  code: z.string(),
  path: z.string(),
});

export const EvalRunRecordSchema = z.object({
  roomId: z.string(),
  roomHash: z.string(),
  date: z.string(),
  seed: z.string(),
  tier: Tier,
  source: PlanSource,
  model: z.string().optional(),
  validBeforeRepair: z.boolean(),
  validAfterRepair: z.boolean(),
  fallbackToProcedural: z.boolean(),
  latencyMs: z.number(),
  ttftMs: z.number().nullable(),
  repairs: z.array(z.string()),
  estimatedCostUsd: z.number(),
  telemetry: z.array(LlmCallTelemetrySchema),
  distinctSurfaces: z.number().int(),
  distinctPieceTypes: z.number().int(),
  pieceTypes: z.array(z.string()),
  surfaceLabels: z.array(z.string()),
  issuesFirstTry: z.array(IssueTraceSchema),
  issuesAfterLocal: z.array(IssueTraceSchema).nullable(),
  issuesAfterLlmRepair: z.array(IssueTraceSchema).nullable(),
  repairedBy: z.enum(['local', 'llm']).nullable(),
  firstTryPlan: z.unknown().optional(),
  firstTryRawText: z.string().nullable().optional(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecordSchema>;

export const EvalAggregateSchema = z.object({
  runCount: z.number().int(),
  validBeforeRepairCount: z.number().int(),
  validAfterRepairCount: z.number().int(),
  fallbackToProceduralCount: z.number().int(),
  validBeforeRepairPct: z.number(),
  validAfterRepairPct: z.number(),
  fallbackToProceduralPct: z.number(),
  models: z.record(z.string(), z.number()),
  p50LatencyMs: z.number(),
  p95LatencyMs: z.number(),
  p50TtftMs: z.number(),
  p95TtftMs: z.number(),
  estimatedCostUsd: z.number(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  thinkingTokens: z.number().int(),
  thoughtsTokenCount: z.number().int(),
  meanDistinctSurfaces: z.number(),
  meanDistinctPieceTypes: z.number(),
  meanPairwisePieceTypeJaccard: z.number(),
  meanPairwiseSurfaceLabelJaccard: z.number(),
  missingUsageCalls: z.number().int(),
  unknownModelCalls: z.number().int(),
  issueCounts: z.object({
    firstTry: z.record(z.string(), z.number()),
    afterLocal: z.record(z.string(), z.number()),
    afterLlmRepair: z.record(z.string(), z.number()),
  }),
  repairedByCounts: z.object({
    local: z.number().int(),
    llm: z.number().int(),
    none: z.number().int(),
  }),
});
export type EvalAggregate = z.infer<typeof EvalAggregateSchema>;

export const EvalBarSchema = z.object({
  validAfterRepairMinPct: z.number(),
  p95MaxMs: z.number(),
  met: z.boolean(),
});
export type EvalBar = z.infer<typeof EvalBarSchema>;

export const EvalReportSchema = z.object({
  generatedAt: z.string(),
  mock: z.boolean(),
  promptVersion: z.string(),
  directorModel: z.string(),
  thinking: z.string(),
  roomIds: z.array(z.string()),
  seedDates: z.array(z.string()),
  tiers: z.array(Tier),
  bar: EvalBarSchema,
  aggregate: EvalAggregateSchema,
  runs: z.array(EvalRunRecordSchema),
});
export type EvalReport = z.infer<typeof EvalReportSchema>;

export function matrixLabel(report: {
  roomIds: readonly string[];
  seedDates: readonly string[];
  tiers: readonly string[];
  aggregate: { runCount: number };
}): string {
  const rooms = report.roomIds.length;
  const tiers = report.tiers.length;
  const seeds = report.seedDates.length;
  const cells = rooms * tiers * seeds;
  const runs = report.aggregate.runCount;
  const shape = `${String(rooms)} rooms × ${String(tiers)} tiers × ${String(seeds)} seeds`;
  if (runs === cells) {
    return `${shape} = ${String(runs)} runs`;
  }
  return `${shape} = ${String(cells)} cells; ${String(runs)} runs`;
}

function countIssueCodes(
  runs: readonly EvalRunRecord[],
  field: 'issuesFirstTry' | 'issuesAfterLocal' | 'issuesAfterLlmRepair'
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const run of runs) {
    const issues = run[field];
    if (issues === null) {
      continue;
    }
    for (const issue of issues) {
      counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    }
  }
  return counts;
}

export function roundPct(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Math.round((count / total) * 1000) / 10;
}

/** Linear interpolation percentile on a copy of `values`. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (idx - lo);
}

export function aggregateRuns(runs: readonly EvalRunRecord[]): EvalAggregate {
  const total = runs.length;
  let validBefore = 0;
  let validAfter = 0;
  let fallback = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let thinkingTokens = 0;
  let thoughtsTokenCount = 0;
  let missingUsageCalls = 0;
  let unknownModelCalls = 0;
  let estimatedCostUsd = 0;
  let distinctSurfacesSum = 0;
  let distinctPieceTypesSum = 0;
  const models: Record<string, number> = {};
  const latencies: number[] = [];
  const ttfts: number[] = [];

  for (const run of runs) {
    if (run.validBeforeRepair) {
      validBefore += 1;
    }
    if (run.validAfterRepair) {
      validAfter += 1;
    }
    if (run.fallbackToProcedural) {
      fallback += 1;
    }
    latencies.push(run.latencyMs);
    if (run.ttftMs !== null) {
      ttfts.push(run.ttftMs);
    }
    estimatedCostUsd += run.estimatedCostUsd;
    distinctSurfacesSum += run.distinctSurfaces;
    distinctPieceTypesSum += run.distinctPieceTypes;
    const answered = run.model ?? 'procedural';
    models[answered] = (models[answered] ?? 0) + 1;
    for (const row of run.telemetry) {
      if (row.inputTokens === null || row.outputTokens === null) {
        missingUsageCalls += 1;
      }
      if (priceForModel(row.model) === undefined) {
        unknownModelCalls += 1;
      }
      if (row.inputTokens !== null) {
        inputTokens += row.inputTokens;
      }
      if (row.outputTokens !== null) {
        outputTokens += row.outputTokens;
      }
      const thoughts = row.thoughtsTokenCount ?? row.thinkingTokens;
      if (thoughts !== null) {
        thinkingTokens += thoughts;
        thoughtsTokenCount += thoughts;
      }
    }
  }

  const roomSets = unionSetsByRoom(runs);
  const repairedByCounts = { local: 0, llm: 0, none: 0 };
  for (const run of runs) {
    if (run.repairedBy === 'local') {
      repairedByCounts.local += 1;
    } else if (run.repairedBy === 'llm') {
      repairedByCounts.llm += 1;
    } else {
      repairedByCounts.none += 1;
    }
  }

  return {
    runCount: total,
    validBeforeRepairCount: validBefore,
    validAfterRepairCount: validAfter,
    fallbackToProceduralCount: fallback,
    validBeforeRepairPct: roundPct(validBefore, total),
    validAfterRepairPct: roundPct(validAfter, total),
    fallbackToProceduralPct: roundPct(fallback, total),
    models,
    p50LatencyMs: Math.round(percentile(latencies, 50) * 10) / 10,
    p95LatencyMs: Math.round(percentile(latencies, 95) * 10) / 10,
    p50TtftMs: Math.round(percentile(ttfts, 50) * 10) / 10,
    p95TtftMs: Math.round(percentile(ttfts, 95) * 10) / 10,
    estimatedCostUsd,
    inputTokens,
    outputTokens,
    thinkingTokens,
    thoughtsTokenCount,
    meanDistinctSurfaces:
      total === 0 ? 0 : Math.round((distinctSurfacesSum / total) * 10) / 10,
    meanDistinctPieceTypes:
      total === 0 ? 0 : Math.round((distinctPieceTypesSum / total) * 10) / 10,
    meanPairwisePieceTypeJaccard: meanPairwiseJaccard(roomSets.pieceTypeSets),
    meanPairwiseSurfaceLabelJaccard: meanPairwiseJaccard(
      roomSets.surfaceLabelSets
    ),
    missingUsageCalls,
    unknownModelCalls,
    issueCounts: {
      firstTry: countIssueCodes(runs, 'issuesFirstTry'),
      afterLocal: countIssueCodes(runs, 'issuesAfterLocal'),
      afterLlmRepair: countIssueCodes(runs, 'issuesAfterLlmRepair'),
    },
    repairedByCounts,
  };
}

export function evaluateBar(aggregate: EvalAggregate): EvalBar {
  return {
    validAfterRepairMinPct: EVAL_BAR_VALID_AFTER_REPAIR_PCT,
    p95MaxMs: EVAL_BAR_P95_MS,
    met:
      aggregate.validAfterRepairPct >= EVAL_BAR_VALID_AFTER_REPAIR_PCT &&
      aggregate.p95LatencyMs <= EVAL_BAR_P95_MS,
  };
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}

function formatMs(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function issueCodeRows(aggregate: EvalAggregate): string {
  const codes = new Set([
    ...Object.keys(aggregate.issueCounts.firstTry),
    ...Object.keys(aggregate.issueCounts.afterLocal),
    ...Object.keys(aggregate.issueCounts.afterLlmRepair),
  ]);
  const sorted = [...codes].sort();
  if (sorted.length === 0) {
    return '| — | 0 | 0 | 0 |';
  }
  return sorted
    .map((code) => {
      const first = aggregate.issueCounts.firstTry[code] ?? 0;
      const local = aggregate.issueCounts.afterLocal[code] ?? 0;
      const llm = aggregate.issueCounts.afterLlmRepair[code] ?? 0;
      return `| ${code} | ${String(first)} | ${String(local)} | ${String(llm)} |`;
    })
    .join('\n');
}

export function renderMarkdown(report: EvalReport): string {
  const modeLine = report.mock
    ? '**Mode:** mock (`FakeListChatModel`; not a live LLM run). Pipeline exercise only — do not treat the bar as a production quality signal.'
    : '**Mode:** live (Gemini only).';

  const barLine = report.bar.met
    ? `**Bar: MET** (≥ ${String(report.bar.validAfterRepairMinPct)}% valid after repair AND p95 ≤ ${String(report.bar.p95MaxMs)} ms)`
    : `**Bar: NOT MET** (need ≥ ${String(report.bar.validAfterRepairMinPct)}% valid after repair AND p95 ≤ ${String(report.bar.p95MaxMs)} ms)`;

  const modelRows = Object.entries(report.aggregate.models)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([model, count]) => `| ${model} | ${String(count)} |`)
    .join('\n');

  const runRows = report.runs
    .map((run) => {
      const model = run.model ?? '—';
      const ttft = run.ttftMs === null ? '—' : run.ttftMs.toFixed(1);
      return `| ${run.roomId} | ${run.date} | ${run.tier} | ${run.source} | ${model} | ${run.validBeforeRepair ? 'yes' : 'no'} | ${run.validAfterRepair ? 'yes' : 'no'} | ${run.fallbackToProcedural ? 'yes' : 'no'} | ${run.latencyMs.toFixed(1)} | ${ttft} | ${String(run.distinctSurfaces)} | ${String(run.distinctPieceTypes)} | ${formatUsd(run.estimatedCostUsd)} |`;
    })
    .join('\n');

  const mockBanner = report.mock
    ? '\n> **MOCK RUN** — generated with LangChain `FakeListChatModel`, not Gemini. Keys were not required.\n'
    : '';

  return `# Director eval — ${report.generatedAt.slice(0, 10)}
${mockBanner}
${modeLine}

| Field | Value |
| --- | --- |
| Generated at | ${report.generatedAt} |
| Prompt version | ${report.promptVersion} |
| Director model | ${report.directorModel} |
| Thinking | ${report.thinking} |
| Rooms | ${report.roomIds.join(', ')} |
| Seeds (dates) | ${report.seedDates.join(', ')} |
| Tiers | ${report.tiers.join(', ')} |
| Matrix | ${matrixLabel(report)} |

## Bar

Target: ≥ ${String(report.bar.validAfterRepairMinPct)}% valid after repair AND p95 ≤ ${String(report.bar.p95MaxMs)} ms.

${barLine}

## Aggregate

| Metric | Value |
| --- | --- |
| valid-before-repair | ${formatPct(report.aggregate.validBeforeRepairPct)} (${String(report.aggregate.validBeforeRepairCount)}/${String(report.aggregate.runCount)}) |
| valid-after-repair | ${formatPct(report.aggregate.validAfterRepairPct)} (${String(report.aggregate.validAfterRepairCount)}/${String(report.aggregate.runCount)}) |
| fallback-to-procedural | ${formatPct(report.aggregate.fallbackToProceduralPct)} (${String(report.aggregate.fallbackToProceduralCount)}/${String(report.aggregate.runCount)}) |
| p50 latency | ${formatMs(report.aggregate.p50LatencyMs)} |
| p95 latency | ${formatMs(report.aggregate.p95LatencyMs)} |
| p50 TTFT | ${formatMs(report.aggregate.p50TtftMs)} |
| p95 TTFT | ${formatMs(report.aggregate.p95TtftMs)} |
| thoughtsTokenCount | ${String(report.aggregate.thoughtsTokenCount)} |
| mean distinct surfaces / plan | ${report.aggregate.meanDistinctSurfaces.toFixed(1)} |
| mean distinct piece types / plan | ${report.aggregate.meanDistinctPieceTypes.toFixed(1)} |
| mean pairwise piece-type Jaccard | ${report.aggregate.meanPairwisePieceTypeJaccard.toFixed(3)} |
| mean pairwise surface-label Jaccard | ${report.aggregate.meanPairwiseSurfaceLabelJaccard.toFixed(3)} |
| estimated cost | ${formatUsd(report.aggregate.estimatedCostUsd)} |
| token usage | ${String(report.aggregate.inputTokens)} in / ${String(report.aggregate.thoughtsTokenCount)} thoughts / ${String(report.aggregate.outputTokens)} out |
| missing usage metadata | ${String(report.aggregate.missingUsageCalls)} calls |
| unknown model prices | ${String(report.aggregate.unknownModelCalls)} calls |

### Which model answered

| Model | Runs |
| --- | --- |
${modelRows.length > 0 ? modelRows : '| — | 0 |'}

### Repair stage that fixed the plan

| Stage | Runs |
| --- | --- |
| local | ${String(report.aggregate.repairedByCounts.local)} |
| llm | ${String(report.aggregate.repairedByCounts.llm)} |
| none | ${String(report.aggregate.repairedByCounts.none)} |

### Validation issue codes

Counts of \`validatePlan\` \`code\` (+ path in JSON) at first try, after local repair, and after LLM repair.

| code | first-try | after local | after LLM repair |
| --- | --- | --- | --- |
${issueCodeRows(report.aggregate)}

## Per run

| room | date | tier | source | model | valid before | valid after | procedural | latency ms | TTFT ms | surfaces | pieces | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${runRows}

Live reports also store each run's raw first-try LLM plan (\`firstTryPlan\`) and, when structured parse failed, \`firstTryRawText\` in the JSON next to the issue traces.

## Pricing

Per-model USD / 1M tokens live in \`apps/api/eval/prices.ts\` (sources and date in that file). Cost is \`tokens × price / 1e6\` summed over LLM round-trips. Missing usage or unknown model ids count as $0.
`;
}

export function printSummary(report: EvalReport): void {
  const bar = report.bar.met ? 'MET' : 'NOT MET';
  const mode = report.mock ? 'mock' : 'live';
  const lines = [
    `Director eval (${mode})`,
    `Rooms: ${report.roomIds.join(', ')}`,
    `Matrix: ${matrixLabel(report)}`,
    `valid-before-repair: ${report.aggregate.validBeforeRepairPct.toFixed(1)}%`,
    `valid-after-repair: ${report.aggregate.validAfterRepairPct.toFixed(1)}%`,
    `fallback-to-procedural: ${report.aggregate.fallbackToProceduralPct.toFixed(1)}%`,
    `models: ${Object.entries(report.aggregate.models)
      .map(([model, count]) => `${model}=${String(count)}`)
      .join(', ')}`,
    `p50: ${report.aggregate.p50LatencyMs.toFixed(1)} ms  p95: ${report.aggregate.p95LatencyMs.toFixed(1)} ms`,
    `p50 TTFT: ${report.aggregate.p50TtftMs.toFixed(1)} ms  p95 TTFT: ${report.aggregate.p95TtftMs.toFixed(1)} ms`,
    `thoughtsTokenCount: ${String(report.aggregate.thoughtsTokenCount)}`,
    `mean distinct surfaces: ${report.aggregate.meanDistinctSurfaces.toFixed(1)}  pieces: ${report.aggregate.meanDistinctPieceTypes.toFixed(1)}`,
    `mean pairwise Jaccard piece-types: ${report.aggregate.meanPairwisePieceTypeJaccard.toFixed(3)}  surface-labels: ${report.aggregate.meanPairwiseSurfaceLabelJaccard.toFixed(3)}`,
    `tokens: ${String(report.aggregate.inputTokens)} in / ${String(report.aggregate.thoughtsTokenCount)} thoughts / ${String(report.aggregate.outputTokens)} out`,
    `estimated cost: $${report.aggregate.estimatedCostUsd.toFixed(6)}`,
    `bar (>= ${String(report.bar.validAfterRepairMinPct)}% valid after repair AND p95 <= ${String(report.bar.p95MaxMs)} ms): ${bar}`,
  ];
  for (const line of lines) {
    console.log(line);
  }
}
