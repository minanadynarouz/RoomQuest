import { KIT_CATALOG } from '@roomquest/schema';
import { describe, expect, it } from 'vitest';
import { MAX_VIEW_ANGLE_DEG, MIN_PATH_DISTANCE_M } from './graph-utils';
import { RAMP_FLOOR_RUN_PER_DH, VALIDATION_LIMITS } from './limits';

describe('VALIDATION_LIMITS', () => {
  it('mirrors the validator constants and KIT_CATALOG', () => {
    expect(VALIDATION_LIMITS.plankMaxStepHeightM).toBe(
      KIT_CATALOG.plank_bridge.maxDeltaHeight
    );
    expect(VALIDATION_LIMITS.rampMaxStepHeightM).toBe(
      KIT_CATALOG.ramp.maxDeltaHeight
    );
    expect(VALIDATION_LIMITS.plankMinGapM).toBe(KIT_CATALOG.plank_bridge.minGap);
    expect(VALIDATION_LIMITS.plankMaxGapM).toBe(KIT_CATALOG.plank_bridge.maxGap);
    expect(VALIDATION_LIMITS.maxSlopeDeg).toBe(MAX_VIEW_ANGLE_DEG);
    expect(VALIDATION_LIMITS.minPathDistanceM).toBe(MIN_PATH_DISTANCE_M);
    expect(VALIDATION_LIMITS.rampFloorRunPerDh).toBe(RAMP_FLOOR_RUN_PER_DH);
    expect(VALIDATION_LIMITS.playerReach).toEqual(['hand', 'ray']);
  });
});
