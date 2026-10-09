/**
 * Stars formula tests - F-02 / F-07
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GEM_TARGET,
  DEFAULT_PAR_TIME_MS,
  calculateStars,
  resolveStarTargets,
} from './stars.js';

const par = 180_000;

describe('resolveStarTargets', () => {
  it('reads parTimeMs and gemTarget from the plan when present', () => {
    expect(
      resolveStarTargets({ parTimeMs: 120_000, gemTarget: 4 })
    ).toEqual({ parTimeMs: 120_000, gemTarget: 4 });
  });

  it('counts gem placements when gemTarget is absent', () => {
    expect(
      resolveStarTargets({
        parTimeMs: par,
        placements: [
          { piece: 'village_hut' },
          { piece: 'gem' },
          { piece: 'gem' },
          { piece: 'crystal_shrine' },
        ],
      })
    ).toEqual({ parTimeMs: par, gemTarget: 2 });
  });

  it('uses documented defaults when plan fields are missing', () => {
    expect(resolveStarTargets(null)).toEqual({
      parTimeMs: DEFAULT_PAR_TIME_MS,
      gemTarget: DEFAULT_GEM_TARGET,
    });
    expect(resolveStarTargets({})).toEqual({
      parTimeMs: DEFAULT_PAR_TIME_MS,
      gemTarget: DEFAULT_GEM_TARGET,
    });
    expect(resolveStarTargets({ parTimeMs: 0, placements: [] })).toEqual({
      parTimeMs: DEFAULT_PAR_TIME_MS,
      gemTarget: DEFAULT_GEM_TARGET,
    });
  });
});

describe('calculateStars', () => {
  describe('0 stars', () => {
    it('returns 0 when the run is not completed', () => {
      expect(
        calculateStars({
          plan: { parTimeMs: par, gemTarget: 3 },
          gemsCollected: 5,
          elapsedMs: 1_000,
          completed: false,
        })
      ).toBe(0);
    });
  });

  describe('3 stars', () => {
    it('returns 3 when time ≤ par AND gems ≥ target', () => {
      expect(
        calculateStars({
          plan: { parTimeMs: par, gemTarget: 3 },
          gemsCollected: 3,
          elapsedMs: par,
        })
      ).toBe(3);
      expect(
        calculateStars({
          plan: { parTimeMs: par, gemTarget: 3 },
          gemsCollected: 4,
          elapsedMs: 150_000,
        })
      ).toBe(3);
    });

    it('treats a 0 gem target as already satisfied', () => {
      expect(
        calculateStars({
          plan: { parTimeMs: par, gemTarget: 0 },
          gemsCollected: 0,
          elapsedMs: par,
        })
      ).toBe(3);
    });
  });

  describe('2 stars', () => {
    it('returns 2 when time ≤ par but gems < target', () => {
      expect(
        calculateStars({
          plan: { parTimeMs: par, gemTarget: 3 },
          gemsCollected: 2,
          elapsedMs: par,
        })
      ).toBe(2);
    });

    it('returns 2 when gems ≥ target but time > par', () => {
      expect(
        calculateStars({
          plan: { parTimeMs: par, gemTarget: 3 },
          gemsCollected: 3,
          elapsedMs: 200_000,
        })
      ).toBe(2);
    });
  });

  describe('1 star', () => {
    it('returns 1 when time > par AND gems < target', () => {
      expect(
        calculateStars({
          plan: { parTimeMs: par, gemTarget: 3 },
          gemsCollected: 0,
          elapsedMs: 200_000,
        })
      ).toBe(1);
    });
  });

  describe('plan placement fallback', () => {
    it('uses gem placement count as the target', () => {
      const plan = {
        parTimeMs: par,
        placements: [{ piece: 'gem' as const }, { piece: 'gem' as const }],
      };
      expect(
        calculateStars({ plan, gemsCollected: 2, elapsedMs: par })
      ).toBe(3);
      expect(
        calculateStars({ plan, gemsCollected: 1, elapsedMs: par })
      ).toBe(2);
    });
  });
});
