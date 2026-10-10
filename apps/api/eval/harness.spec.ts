import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEvalArgs } from './args';
import { livePlanDump, runEvalHarness } from './harness';
import { findRepoRoot } from './paths';
import { EvalReportSchema, renderMarkdown } from './report';

const FIXED_NOW_MS = 1_700_000_000_000;

describe('eval harness', () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const dir of temps.splice(0, temps.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs mock mode on 1 room × 1 seed and matches the report shape', async () => {
    const now = (): number => FIXED_NOW_MS;
    const result = await runEvalHarness({
      mock: true,
      roomLimit: 1,
      seedLimit: 1,
      now,
      write: false,
      googleApiKey: undefined,
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      return;
    }

    const parsed = EvalReportSchema.parse(result.report);
    expect(parsed.mock).toBe(true);
    expect(parsed.generatedAt).toBe(new Date(FIXED_NOW_MS).toISOString());
    expect(parsed.roomIds).toEqual(['living_room']);
    expect(parsed.seedDates).toHaveLength(1);
    expect(parsed.runs.length).toBe(
      parsed.seedDates.length * parsed.tiers.length
    );
    expect(parsed.runs.length).toBeGreaterThanOrEqual(1);
    expect(parsed.aggregate.runCount).toBe(parsed.runs.length);
    expect(typeof parsed.aggregate.validBeforeRepairPct).toBe('number');
    expect(typeof parsed.aggregate.validAfterRepairPct).toBe('number');
    expect(typeof parsed.aggregate.fallbackToProceduralPct).toBe('number');
    expect(typeof parsed.aggregate.p50LatencyMs).toBe('number');
    expect(typeof parsed.aggregate.p95LatencyMs).toBe('number');
    expect(typeof parsed.aggregate.estimatedCostUsd).toBe('number');
    expect(parsed.aggregate.estimatedCostUsd).toBeGreaterThan(0);
    expect(parsed.aggregate.models).toEqual(
      expect.objectContaining({ 'gemini-3.8-flash': parsed.runs.length })
    );
    expect(typeof parsed.bar.met).toBe('boolean');
    expect(parsed.bar.validAfterRepairMinPct).toBe(90);
    expect(parsed.bar.p95MaxMs).toBe(7000);

    for (const run of parsed.runs) {
      expect(run.roomId).toBe('living_room');
      expect(Array.isArray(run.issuesFirstTry)).toBe(true);
      expect(['local', 'llm', null]).toContain(run.repairedBy);
      expect(run.firstTryPlan).toBeUndefined();
      expect(run.firstTryRawText).toBeUndefined();
      expect(typeof run.validBeforeRepair).toBe('boolean');
      expect(typeof run.validAfterRepair).toBe('boolean');
      expect(typeof run.fallbackToProcedural).toBe('boolean');
      expect(typeof run.latencyMs).toBe('number');
      expect(Number.isFinite(run.latencyMs)).toBe(true);
      expect(run.latencyMs).toBeGreaterThanOrEqual(0);
      expect(run.ttftMs === null || typeof run.ttftMs === 'number').toBe(true);
      expect(Array.isArray(run.telemetry)).toBe(true);
      expect(run.telemetry.length).toBeGreaterThanOrEqual(1);
      expect(parsed.thinking.length).toBeGreaterThan(0);
      expect(run.distinctSurfaces).toBeGreaterThan(0);
      expect(run.distinctPieceTypes).toBeGreaterThan(0);
      expect(run.pieceTypes.length).toBe(run.distinctPieceTypes);
      expect(run.telemetry[0]?.thoughtsTokenCount).toBe(5);
    }
    expect(parsed.aggregate.thoughtsTokenCount).toBeGreaterThan(0);
    expect(parsed.aggregate.meanDistinctSurfaces).toBeGreaterThan(0);
    expect(parsed.aggregate.meanDistinctPieceTypes).toBeGreaterThan(0);
  });

  it('skips a live run when GOOGLE_API_KEY is missing', async () => {
    const result = await runEvalHarness({
      mock: false,
      googleApiKey: undefined,
      write: false,
    });
    expect(result.status).toBe('skipped');
    if (result.status !== 'skipped') {
      return;
    }
    expect(result.missingKeys).toContain('GOOGLE_API_KEY');
    expect(result.reason).toMatch(/GOOGLE_API_KEY/);
    expect(result.reason).toMatch(/--mock/);
  });

  it('writes markdown and JSON next to each other', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rq-eval-'));
    temps.push(dir);
    mkdirSync(dir, { recursive: true });
    const result = await runEvalHarness({
      mock: true,
      roomLimit: 1,
      seedLimit: 1,
      tiers: ['easy'],
      now: () => FIXED_NOW_MS,
      write: true,
      outDir: dir,
      repoRoot: findRepoRoot(__dirname),
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      return;
    }
    expect(result.markdownPath).toBe(join(dir, '2023-11-14.md'));
    expect(result.jsonPath).toBe(join(dir, '2023-11-14.json'));
    const json = EvalReportSchema.parse(
      JSON.parse(readFileSync(result.jsonPath ?? '', 'utf8')) as unknown
    );
    expect(json.mock).toBe(true);
    expect(readFileSync(result.markdownPath ?? '', 'utf8')).toMatch(/MOCK RUN/);
  });

  it('keeps first-try LLM plan dumps only in live JSON', () => {
    expect(livePlanDump(true, { th: 'forest' }, '{"x":1}')).toEqual({});
    expect(livePlanDump(false, { th: 'forest', pl: [] }, null)).toEqual({
      firstTryPlan: { th: 'forest', pl: [] },
      firstTryRawText: null,
    });
    expect(livePlanDump(false, { nope: true }, '{"nope":true}')).toEqual({
      firstTryPlan: { nope: true },
      firstTryRawText: '{"nope":true}',
    });
  });

  it('parses --mock --rooms --seeds from argv', () => {
    const options = parseEvalArgs(['--mock', '--rooms', '1', '--seeds', '1']);
    expect(options.mock).toBe(true);
    expect(options.roomLimit).toBe(1);
    expect(options.seedLimit).toBe(1);
    expect(options.write).toBe(true);
    expect(options.runCount).toBe(20);
  });

  it('parses --runs and honours it in the harness', async () => {
    const options = parseEvalArgs(['--mock', '--runs', '3']);
    expect(options.runCount).toBe(3);
    const result = await runEvalHarness({
      mock: true,
      roomLimit: 1,
      seedLimit: 1,
      tiers: ['easy'],
      runCount: 3,
      now: () => FIXED_NOW_MS,
      write: false,
      googleApiKey: undefined,
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      return;
    }
    expect(result.report.runs).toHaveLength(3);
    expect(result.report.aggregate.runCount).toBe(3);
    expect(result.report.aggregate.issueCounts).toEqual({
      firstTry: expect.any(Object),
      afterLocal: expect.any(Object),
      afterLlmRepair: expect.any(Object),
    });
    const markdown = renderMarkdown(result.report);
    expect(markdown).toMatch(/1 rooms × 1 tiers × 1 seeds = 1 cells; 3 runs/);
    expect(markdown).toContain('Validation issue codes');
    expect(markdown).toContain('Repair stage that fixed the plan');
  });

  it('cycles rooms, then tiers, then seeds', async () => {
    const result = await runEvalHarness({
      mock: true,
      roomLimit: 1,
      seedLimit: 2,
      tiers: ['easy', 'normal'],
      runCount: 3,
      now: () => FIXED_NOW_MS,
      write: false,
      googleApiKey: undefined,
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      return;
    }
    expect(result.report.runs.map((run) => `${run.tier}:${run.date}`)).toEqual([
      'easy:2026-10-01',
      'easy:2026-10-02',
      'normal:2026-10-01',
    ]);
  });
});

