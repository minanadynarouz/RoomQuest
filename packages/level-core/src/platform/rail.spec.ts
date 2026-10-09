import { describe, expect, it } from 'vitest';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_PLATFORM_PORTAL_PLAN,
} from '@roomquest/fixtures';
import { validatePlan } from '../validate';
import { MAX_RAIL_LENGTH_M, PLATFORM_ALIGN_EPS_M } from './constants';
import {
  buildPlatformRail,
  clampRailLength,
  clampToRail,
  emptyRail,
  emptyRailSample,
  isPlatformAligned,
  makeRail,
  railPoint,
} from './rail';

describe('clampRailLength', () => {
  it('caps at 1 m and drops non-positive values', () => {
    expect(clampRailLength(0.4)).toBe(0.4);
    expect(clampRailLength(2)).toBe(MAX_RAIL_LENGTH_M);
    expect(clampRailLength(0)).toBe(0);
    expect(clampRailLength(-1)).toBe(0);
  });
});

describe('clampToRail', () => {
  const rail = emptyRail();
  makeRail(0, 0.5, 0, 2, 0.5, 0, rail);
  const sample = emptyRailSample();

  it('projects onto the segment and clamps past the far end', () => {
    expect(rail.length).toBe(MAX_RAIL_LENGTH_M);
    clampToRail(0.4, 0.9, 0.2, rail, sample);
    expect(sample.t).toBeCloseTo(0.4, 6);
    expect(sample.x).toBeCloseTo(0.4, 6);
    expect(sample.y).toBeCloseTo(0.5, 6);
    expect(sample.z).toBeCloseTo(0, 6);

    clampToRail(3, 0.5, 0, rail, sample);
    expect(sample.t).toBe(MAX_RAIL_LENGTH_M);
    expect(sample.x).toBeCloseTo(1, 6);
  });

  it('treats the boarding origin as aligned within 3 cm', () => {
    clampToRail(0.02, 0.5, 0.01, rail, sample);
    expect(sample.aligned).toBe(true);
    expect(isPlatformAligned(0.02, 0.5, 0.01, rail)).toBe(true);

    clampToRail(0.2, 0.5, 0, rail, sample);
    expect(sample.aligned).toBe(false);
    expect(
      isPlatformAligned(0.2, 0.5, 0, rail, PLATFORM_ALIGN_EPS_M)
    ).toBe(false);
  });

  it('writes into the caller-owned sample (no new object)', () => {
    const out = emptyRailSample();
    const returned = clampToRail(0, 0.5, 0, rail, out);
    expect(returned).toBe(out);
  });
});

describe('railPoint', () => {
  it('evaluates origin + t * axis into an out vector', () => {
    const rail = emptyRail();
    makeRail(1, 2, 3, 1, 2, 4, rail);
    const out: [number, number, number] = [0, 0, 0];
    railPoint(rail, rail.farT, out);
    expect(out[0]).toBeCloseTo(1, 6);
    expect(out[1]).toBeCloseTo(2, 6);
    expect(out[2]).toBeCloseTo(3 + rail.length, 6);
  });
});

describe('SYNTHETIC_PLATFORM_PORTAL_PLAN', () => {
  it('validates against the synthetic living-room graph', () => {
    const result = validatePlan(
      SYNTHETIC_PLATFORM_PORTAL_PLAN,
      SYNTHETIC_LIVING_ROOM
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

describe('buildPlatformRail', () => {
  it('builds a ≤ 1 m rail for the platform-portal fixture', () => {
    const placement = SYNTHETIC_PLATFORM_PORTAL_PLAN.placements.find(
      (p) => p.piece === 'moving_platform'
    );
    expect(placement).toBeDefined();
    if (!placement) return;
    const rail = emptyRail();
    const built = buildPlatformRail(SYNTHETIC_LIVING_ROOM, placement, rail);
    expect(built).toBe(rail);
    expect(rail.length).toBeGreaterThan(0);
    expect(rail.length).toBeLessThanOrEqual(MAX_RAIL_LENGTH_M);
    expect(rail.alignT).toBe(0);
    expect(rail.farT).toBe(rail.length);
  });

  it('returns null for non-platform pieces', () => {
    const hut = SYNTHETIC_PLATFORM_PORTAL_PLAN.placements.find(
      (p) => p.piece === 'village_hut'
    );
    expect(hut).toBeDefined();
    if (!hut) return;
    expect(buildPlatformRail(SYNTHETIC_LIVING_ROOM, hut, emptyRail())).toBeNull();
  });
});
