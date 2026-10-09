import { SURFACE_INSET_M } from '../placement/pose';
import {
  SLIME_BODY_WIDTH_M,
  SLIME_PATROL_SPEED_MPS,
  SLIME_STAR_COUNT,
  SLIME_STAR_HEIGHT_M,
  SLIME_STAR_RADIUS_M,
  SLIME_STAR_SPIN_RAD_S,
  SLIME_STUN_DURATION_S,
  SLIME_SQUISH_SCALE_Y,
} from './constants';
import type {
  SlimePatrolConfig,
  SlimeRuntime,
  SlimeStarPose,
  SlimeTickResult,
} from './types';

const MIN_HALF_LENGTH_M = 0.08;
const MAX_HALF_LENGTH_M = 0.32;

/**
 * Build a patrol segment along the longer top-face axis, inset from edges.
 * Surfaces below {@link SLIME_MIN_SURFACE_AREA_M2} still get a tiny segment
 * so tests can inject sizes; placement validation rejects those rooms.
 */
export function slimePatrolConfig(
  surfaceWidthM: number,
  surfaceDepthM: number,
  speedMps = SLIME_PATROL_SPEED_MPS
): SlimePatrolConfig {
  const alongWidth = surfaceWidthM >= surfaceDepthM;
  const span = alongWidth ? surfaceWidthM : surfaceDepthM;
  const usable = Math.max(0, span - 2 * SURFACE_INSET_M - SLIME_BODY_WIDTH_M);
  let half = usable * 0.35;
  if (half < MIN_HALF_LENGTH_M) {
    half = Math.min(MIN_HALF_LENGTH_M, usable * 0.5);
  }
  if (half > MAX_HALF_LENGTH_M) {
    half = MAX_HALF_LENGTH_M;
  }
  return {
    halfLengthM: half,
    speedMps,
    axis: alongWidth ? 'u' : 'v',
  };
}

export function createSlimeRuntime(placementId: string): SlimeRuntime {
  return {
    placementId,
    offsetM: 0,
    dir: 1,
    stunRemainingS: 0,
  };
}

export function isSlimeAwake(state: SlimeRuntime): boolean {
  return state.stunRemainingS <= 0;
}

/** Explorer may cross the slime's path segment only while it is stunned. */
export function canExplorerPassSlime(state: SlimeRuntime): boolean {
  return !isSlimeAwake(state);
}

/**
 * Stun (or refresh) for `durationS`. Returns true when the slime was awake
 * and is now stunned, so the caller can emit `slimeStunned` once.
 */
export function stunSlime(
  state: SlimeRuntime,
  durationS = SLIME_STUN_DURATION_S
): boolean {
  const wasAwake = isSlimeAwake(state);
  state.stunRemainingS = durationS;
  return wasAwake;
}

/**
 * Advance patrol / stun with injected `dt` seconds. No allocations.
 * Returns `'woke'` on the frame the timer hits zero.
 */
export function tickSlime(
  state: SlimeRuntime,
  dt: number,
  config: SlimePatrolConfig
): SlimeTickResult {
  if (dt <= 0) {
    return isSlimeAwake(state) ? 'awake' : 'stunned';
  }
  if (state.stunRemainingS > 0) {
    state.stunRemainingS -= dt;
    if (state.stunRemainingS <= 0) {
      state.stunRemainingS = 0;
      return 'woke';
    }
    return 'stunned';
  }
  const half = config.halfLengthM;
  if (half <= 0 || config.speedMps <= 0) {
    return 'awake';
  }
  state.offsetM += state.dir * config.speedMps * dt;
  if (state.offsetM >= half) {
    state.offsetM = half;
    state.dir = -1;
  } else if (state.offsetM <= -half) {
    state.offsetM = -half;
    state.dir = 1;
  }
  return 'awake';
}

/** Local-metre offset along the patrol axis; the other axis stays 0. */
export function writePatrolLocalOffset(
  state: SlimeRuntime,
  config: SlimePatrolConfig,
  out: { x: number; z: number }
): { x: number; z: number } {
  if (config.axis === 'u') {
    out.x = state.offsetM;
    out.z = 0;
  } else {
    out.x = 0;
    out.z = state.offsetM;
  }
  return out;
}

/**
 * Body Y-scale: fully squished just after stun, recovers to 1 as the timer
 * runs out. Awake slimes are 1.
 */
export function slimeBodyScaleY(
  stunRemainingS: number,
  durationS = SLIME_STUN_DURATION_S
): number {
  if (stunRemainingS <= 0 || durationS <= 0) {
    return 1;
  }
  let t = stunRemainingS / durationS;
  if (t > 1) t = 1;
  return 1 - (1 - SLIME_SQUISH_SCALE_Y) * t;
}

/** Orbit pose for one cartoon star. Writes into caller-owned `out`. */
export function writeStarPose(
  index: number,
  timeS: number,
  out: SlimeStarPose,
  count = SLIME_STAR_COUNT,
  radiusM = SLIME_STAR_RADIUS_M,
  heightM = SLIME_STAR_HEIGHT_M
): SlimeStarPose {
  const step = count > 0 ? (Math.PI * 2) / count : 0;
  const angle = timeS * SLIME_STAR_SPIN_RAD_S + index * step;
  out.x = Math.cos(angle) * radiusM;
  out.z = Math.sin(angle) * radiusM;
  out.y = heightM + Math.sin(timeS * 5.5 + index) * 0.012;
  out.yaw = angle;
  return out;
}
