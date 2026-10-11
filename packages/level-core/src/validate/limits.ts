import { KIT_CATALOG } from '@roomquest/schema';
import {
  GEOM_EPS_M,
  MAX_VIEW_ANGLE_DEG,
  MIN_PATH_DISTANCE_M,
} from './graph-utils';

/** Ramp needs a free floor run of at least this many × |Δh| (PRD §4.2). */
export const RAMP_FLOOR_RUN_PER_DH = 2;

/** Surface `reach` values a player can operate (levers, gates). */
export const PLAYER_REACH_VALUES = ['hand', 'ray'] as const;

function required(value: number | undefined, label: string): number {
  if (value === undefined) {
    throw new Error(`KIT_CATALOG is missing ${label}`);
  }
  return value;
}

/**
 * Numeric rules `validatePlan` enforces, gathered for the director's static
 * prompt prefix. Values come from the same constants / KIT_CATALOG entries
 * the validator reads, so the prompt never drifts from the checks.
 */
export const VALIDATION_LIMITS = Object.freeze({
  /** Max |Δh| a player-built plank bridges (the "step height"). */
  plankMaxStepHeightM: required(
    KIT_CATALOG.plank_bridge.maxDeltaHeight,
    'plank_bridge.maxDeltaHeight'
  ),
  plankMinGapM: required(KIT_CATALOG.plank_bridge.minGap, 'plank_bridge.minGap'),
  plankMaxGapM: required(KIT_CATALOG.plank_bridge.maxGap, 'plank_bridge.maxGap'),
  /** Max |Δh| a ramp climbs. */
  rampMaxStepHeightM: required(
    KIT_CATALOG.ramp.maxDeltaHeight,
    'ramp.maxDeltaHeight'
  ),
  /** Ramp floor run ≥ this × |Δh|. */
  rampFloorRunPerDh: RAMP_FLOOR_RUN_PER_DH,
  /** Lever hand-reach distance. */
  leverMaxReachM: required(
    KIT_CATALOG.lever.maxReachDistance,
    'lever.maxReachDistance'
  ),
  /** Surfaces/targets beyond this angle from forward are SLOPE_TOO_STEEP. */
  maxSlopeDeg: MAX_VIEW_ANGLE_DEG,
  /** Hut → shrine minimum horizontal distance. */
  minPathDistanceM: MIN_PATH_DISTANCE_M,
  /** Geometric tolerance applied to gap/Δh checks. */
  geomEpsM: GEOM_EPS_M,
  playerReach: PLAYER_REACH_VALUES,
});
