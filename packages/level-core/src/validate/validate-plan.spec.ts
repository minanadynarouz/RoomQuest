import { describe, it, expect } from 'vitest';
import { LevelPlan, PAR_TIME_MAX_MS, PAR_TIME_MIN_MS } from '@roomquest/schema';
import { clampParTimeMs, ISSUE_CODES, validatePlan } from './index';
import { GRAPH, PLAN, codesOf } from './spec-helpers';

describe('validatePlan', () => {
  it('accepts the synthetic_living_room fixture plan against its graph', () => {
    const parsed = LevelPlan.parse(PLAN);
    const result = validatePlan(parsed, GRAPH);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('SCHEMA_INVALID: u coordinate out of 0..1', () => {
    const result = validatePlan(
      { ...PLAN, placements: PLAN.placements.map((p) => ({ ...p, u: 2 })) },
      GRAPH
    );
    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain('SCHEMA_INVALID');
  });

  it('SCHEMA_INVALID: graph is not a SurfaceGraph', () => {
    const result = validatePlan(PLAN, {
      ...GRAPH,
      version: 2 as unknown as 1,
    });
    expect(codesOf(result)).toContain('SCHEMA_INVALID');
  });

  it('PAR_OUT_OF_RANGE: raw value below min is reported when not clamped', () => {
    const result = validatePlan({ ...PLAN, parTimeMs: 1000 }, GRAPH);
    expect(codesOf(result)).toContain('PAR_OUT_OF_RANGE');
  });

  it('PAR_OUT_OF_RANGE: raw value above max is reported when not clamped', () => {
    const result = validatePlan(
      { ...PLAN, parTimeMs: PAR_TIME_MAX_MS + 50000 },
      GRAPH
    );
    expect(codesOf(result)).toContain('PAR_OUT_OF_RANGE');
  });

  it('does not report PAR_OUT_OF_RANGE after clampParTimeMs', () => {
    const clamped = clampParTimeMs(999999);
    expect(clamped).toBe(PAR_TIME_MAX_MS);
    const result = validatePlan({ ...PLAN, parTimeMs: clamped }, GRAPH);
    expect(codesOf(result)).not.toContain('PAR_OUT_OF_RANGE');
    expect(result.ok).toBe(true);
  });

  it('does not report PAR_OUT_OF_RANGE at the inclusive bounds', () => {
    expect(
      codesOf(validatePlan({ ...PLAN, parTimeMs: PAR_TIME_MIN_MS }, GRAPH))
    ).not.toContain('PAR_OUT_OF_RANGE');
    expect(
      codesOf(validatePlan({ ...PLAN, parTimeMs: PAR_TIME_MAX_MS }, GRAPH))
    ).not.toContain('PAR_OUT_OF_RANGE');
  });

  it('exports a stable issue-code catalog covering ticket codes', () => {
    const required = [
      'UNKNOWN_SURFACE',
      'LABEL_NOT_ALLOWED',
      'HEIGHT_OUT_OF_RANGE',
      'AREA_TOO_SMALL',
      'GAP_TOO_WIDE',
      'OUT_OF_REACH',
      'SLOPE_TOO_STEEP',
      'START_EQUALS_GOAL',
      'GOAL_UNREACHABLE',
      'BEAT_NOT_COMPLETABLE',
      'UNKNOWN_PLACEMENT_REF',
      'PAR_OUT_OF_RANGE',
    ];
    for (const code of required) {
      expect(ISSUE_CODES).toContain(code);
    }
  });

  it('collects multiple issues rather than failing fast', () => {
    const result = validatePlan(
      {
        ...PLAN,
        start: 's9',
        goal: 's9',
        parTimeMs: 10,
      },
      GRAPH
    );
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(1);
  });

  it('SCHEMA_INVALID: non-object plan', () => {
    const result = validatePlan(null as unknown as typeof PLAN, GRAPH);
    expect(codesOf(result)).toContain('SCHEMA_INVALID');
  });

  it('PAR_OUT_OF_RANGE: non-integer par time', () => {
    const result = validatePlan({ ...PLAN, parTimeMs: 180000.7 }, GRAPH);
    expect(codesOf(result)).toContain('PAR_OUT_OF_RANGE');
  });

  it('skips par-range check when parTimeMs is not a number', () => {
    const result = validatePlan(
      { ...PLAN, parTimeMs: 'soon' as unknown as number },
      GRAPH
    );
    expect(codesOf(result)).toContain('SCHEMA_INVALID');
    expect(codesOf(result)).not.toContain('PAR_OUT_OF_RANGE');
  });
});
