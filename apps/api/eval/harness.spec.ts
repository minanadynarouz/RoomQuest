import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEvalArgs } from './args';
import { runEvalHarness } from './harness';
import { findRepoRoot } from './paths';
import { EvalReportSchema } from './report';

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
    expect(typeof parsed.aggregate.relaxedPct.minPath).toBe('number');
    expect(typeof parsed.aggregate.relaxedPct.hutTable).toBe('number');
    expect(typeof parsed.aggregate.relaxedPct.portalFov).toBe('number');
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
      expect(typeof run.validBeforeRepair).toBe('boolean');
      expect(typeof run.validAfterRepair).toBe('boolean');
      expect(typeof run.fallbackToProcedural).toBe('boolean');
      expect(typeof run.latencyMs).toBe('number');
      expect(Number.isFinite(run.latencyMs)).toBe(true);
      expect(run.latencyMs).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(run.relaxed)).toBe(true);
      expect(Array.isArray(run.telemetry)).toBe(true);
      expect(run.telemetry.length).toBeGreaterThanOrEqual(1);
    }
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

  it('parses --mock --rooms --seeds from argv', () => {
    const options = parseEvalArgs(['--mock', '--rooms', '1', '--seeds', '1']);
    expect(options.mock).toBe(true);
    expect(options.roomLimit).toBe(1);
    expect(options.seedLimit).toBe(1);
    expect(options.write).toBe(true);
  });
});
