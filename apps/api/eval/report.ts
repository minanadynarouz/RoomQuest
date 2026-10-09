import { PlanSource, Tier } from '@roomquest/schema';
import { z } from 'zod';
import { EVAL_BAR_P95_MS, EVAL_BAR_VALID_AFTER_REPAIR_PCT } from './constants';
import { priceForModel } from './prices';

const LlmCallTelemetrySchema = z.object({
  provider: z.enum(['google', 'anthropic']),
  model: z.string(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  latencyMs: z.number(),
  outcome: z.enum(['ok', 'invalid', 'repaired', 'timeout', 'error']),
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
  repairs: z.array(z.string()),
  estimatedCostUsd: z.number(),
  telemetry: z.array(LlmCallTelemetrySchema),
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
  estimatedCostUsd: z.number(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  missingUsageCalls: z.number().int(),
  unknownModelCalls: z.number().int(),
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
  fallbackModel: z.string(),
  roomIds: z.array(z.string()),
  seedDates: z.array(z.string()),
  tiers: z.array(Tier),
  bar: EvalBarSchema,
  aggregate: EvalAggregateSchema,
  runs: z.array(EvalRunRecordSchema),
});
export type EvalReport = z.infer<typeof EvalReportSchema>;

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
  let missingUsageCalls = 0;
  let unknownModelCalls = 0;
  let estimatedCostUsd = 0;
  const models: Record<string, number> = {};
  const latencies: number[] = [];

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
    estimatedCostUsd += run.estimatedCostUsd;
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
    estimatedCostUsd,
    inputTokens,
    outputTokens,
    missingUsageCalls,
    unknownModelCalls,
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

export function renderMarkdown(report: EvalReport): string {
  const modeLine = report.mock
    ? '**Mode:** mock (`FakeListChatModel`; not a live LLM run). Pipeline exercise only — do not treat the bar as a production quality signal.'
    : '**Mode:** live (Gemini primary, Anthropic fallback when configured).';

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
      return `| ${run.roomId} | ${run.date} | ${run.tier} | ${run.source} | ${model} | ${run.validBeforeRepair ? 'yes' : 'no'} | ${run.validAfterRepair ? 'yes' : 'no'} | ${run.fallbackToProcedural ? 'yes' : 'no'} | ${run.latencyMs.toFixed(1)} | ${formatUsd(run.estimatedCostUsd)} |`;
    })
    .join('\n');

  const mockBanner = report.mock
    ? '\n> **MOCK RUN** — generated with LangChain `FakeListChatModel`, not Gemini or Anthropic. Keys were not required.\n'
    : '';

  return `# Director eval — ${report.generatedAt.slice(0, 10)}
${mockBanner}
${modeLine}

| Field | Value |
| --- | --- |
| Generated at | ${report.generatedAt} |
| Prompt version | ${report.promptVersion} |
| Director model | ${report.directorModel} |
| Fallback model | ${report.fallbackModel} |
| Rooms | ${report.roomIds.join(', ')} |
| Seeds (dates) | ${report.seedDates.join(', ')} |
| Tiers | ${report.tiers.join(', ')} |
| Matrix | ${String(report.roomIds.length)} rooms × ${String(report.seedDates.length)} seeds × ${String(report.tiers.length)} tiers = ${String(report.aggregate.runCount)} runs |

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
| estimated cost | ${formatUsd(report.aggregate.estimatedCostUsd)} |
| token usage | ${String(report.aggregate.inputTokens)} in / ${String(report.aggregate.outputTokens)} out |
| missing usage metadata | ${String(report.aggregate.missingUsageCalls)} calls |
| unknown model prices | ${String(report.aggregate.unknownModelCalls)} calls |

### Which model answered

| Model | Runs |
| --- | --- |
${modelRows.length > 0 ? modelRows : '| — | 0 |'}

## Per run

| room | date | tier | source | model | valid before | valid after | procedural | latency ms | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${runRows}

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
    `Matrix: ${String(report.roomIds.length)} rooms × ${String(report.seedDates.length)} seeds × ${String(report.tiers.length)} tiers = ${String(report.aggregate.runCount)} runs`,
    `valid-before-repair: ${report.aggregate.validBeforeRepairPct.toFixed(1)}%`,
    `valid-after-repair: ${report.aggregate.validAfterRepairPct.toFixed(1)}%`,
    `fallback-to-procedural: ${report.aggregate.fallbackToProceduralPct.toFixed(1)}%`,
    `models: ${Object.entries(report.aggregate.models)
      .map(([model, count]) => `${model}=${String(count)}`)
      .join(', ')}`,
    `p50: ${report.aggregate.p50LatencyMs.toFixed(1)} ms  p95: ${report.aggregate.p95LatencyMs.toFixed(1)} ms`,
    `estimated cost: $${report.aggregate.estimatedCostUsd.toFixed(6)}`,
    `bar (>= ${String(report.bar.validAfterRepairMinPct)}% valid after repair AND p95 <= ${String(report.bar.p95MaxMs)} ms): ${bar}`,
  ];
  for (const line of lines) {
    console.log(line);
  }
}
