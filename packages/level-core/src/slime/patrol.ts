import { SURFACE_INSET_M } from '../placement/pose';
import {
  SLIME_BODY_WIDTH_M,
  SLIME_GROGGY_SCALE_Y,
  SLIME_GROGGY_STAR_FADE_S,
  SLIME_GROGGY_STAR_MIN_SCALE,
  SLIME_GROGGY_STRETCH,
  SLIME_GROGGY_TILT_RAD,
  SLIME_PATROL_SPEED_MPS,
  SLIME_SQUISH_SCALE_Y,
  SLIME_SQUISH_STRETCH,
  SLIME_STAR_COUNT,
  SLIME_STAR_HEIGHT_M,
  SLIME_STAR_RADIUS_M,
  SLIME_STAR_SPIN_RAD_S,
  SLIME_STUN_DURATION_S,
  SLIME_ZONE_HEIGHT_M,
  SLIME_ZONE_PAD_M,
} from './constants';
import type {
  SlimeBodyScale,
  SlimeExplorerLocal,
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
    surfaceWidthM,
    surfaceDepthM,
  };
}

export function createSlimeRuntime(placementId: string): SlimeRuntime {
  return {
    placementId,
    offsetM: 0,
    dir: 1,
    stunRemainingS: 0,
    groggy: false,
    groggyElapsedS: 0,
  };
}

export function isSlimeAwake(state: SlimeRuntime): boolean {
  return state.stunRemainingS <= 0 && !state.groggy;
}

export function isSlimeGroggy(state: SlimeRuntime): boolean {
  return state.groggy;
}

/**
 * Explorer may cross the slime's path while stunned or groggy (the hop
 * latch after `slimeWoke`). Fully awake slimes block.
 */
export function canExplorerPassSlime(state: SlimeRuntime): boolean {
  return !isSlimeAwake(state);
}

/**
 * Stun (or refresh) for `durationS`. Returns true when the slime was not
 * already in the 4 s stun timer, so the caller can emit `slimeStunned`.
 * Poking a groggy slime starts a fresh stun.
 */
export function stunSlime(
  state: SlimeRuntime,
  durationS = SLIME_STUN_DURATION_S
): boolean {
  const newly = state.stunRemainingS <= 0;
  state.stunRemainingS = durationS;
  state.groggy = false;
  state.groggyElapsedS = 0;
  return newly;
}

/**
 * True when the explorer is still on the slime's surface-sized occupancy
 * box (home-local). Used to keep groggy until they have cleared the zone.
 */
export function explorerInSlimePatrolZone(
  config: SlimePatrolConfig,
  local: SlimeExplorerLocal
): boolean {
  if (Math.abs(local.y) > SLIME_ZONE_HEIGHT_M) return false;
  const halfW = config.surfaceWidthM * 0.5 + SLIME_ZONE_PAD_M;
  const halfD = config.surfaceDepthM * 0.5 + SLIME_ZONE_PAD_M;
  return Math.abs(local.x) <= halfW && Math.abs(local.z) <= halfD;
}

/**
 * Advance patrol / stun / groggy with injected `dt` seconds. No allocations.
 * Pass caller-owned `explorerLocal` from the XR system so groggy tracks
 * occupancy; omit it in tests that only care about the 4 s stun.
 *
 * Returns `'woke'` on the frame the timer hits zero (still emit `slimeWoke`).
 * Returns `'cleared'` on the frame groggy ends and patrol may resume.
 */
export function tickSlime(
  state: SlimeRuntime,
  dt: number,
  config: SlimePatrolConfig,
  explorerLocal?: SlimeExplorerLocal | null
): SlimeTickResult {
  if (dt <= 0) {
    if (state.stunRemainingS > 0) return 'stunned';
    if (state.groggy) return 'groggy';
    return 'awake';
  }
  if (state.stunRemainingS > 0) {
    state.stunRemainingS -= dt;
    if (state.stunRemainingS <= 0) {
      state.stunRemainingS = 0;
      if (explorerLocal) {
        state.groggy = true;
        state.groggyElapsedS = 0;
      }
      return 'woke';
    }
    return 'stunned';
  }
  if (state.groggy) {
    state.groggyElapsedS += dt;
    if (!explorerLocal || !explorerInSlimePatrolZone(config, explorerLocal)) {
      state.groggy = false;
      state.groggyElapsedS = 0;
      return 'cleared';
    }
    return 'groggy';
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
 * Body Y-scale: fully squished for the whole stun, groggy stays squashed
 * (half-closed eyes), awake is 1. No recover-to-1 during the 4 s timer —
 * that looked awake while the explorer could still pass.
 */
export function slimeBodyScaleY(state: SlimeRuntime): number {
  if (state.groggy) return SLIME_GROGGY_SCALE_Y;
  if (state.stunRemainingS > 0) return SLIME_SQUISH_SCALE_Y;
  return 1;
}

/** Caller-owned squash / slump for the existing body mesh. */
export function writeSlimeBodyScale(
  state: SlimeRuntime,
  out: SlimeBodyScale
): SlimeBodyScale {
  if (state.groggy) {
    out.x = SLIME_GROGGY_STRETCH;
    out.y = SLIME_GROGGY_SCALE_Y;
    out.z = SLIME_GROGGY_STRETCH;
    out.tiltX = SLIME_GROGGY_TILT_RAD;
    return out;
  }
  if (state.stunRemainingS > 0) {
    out.x = SLIME_SQUISH_STRETCH;
    out.y = SLIME_SQUISH_SCALE_Y;
    out.z = SLIME_SQUISH_STRETCH;
    out.tiltX = 0;
    return out;
  }
  out.x = 1;
  out.y = 1;
  out.z = 1;
  out.tiltX = 0;
  return out;
}

/** 1 while stunned, fades toward min while groggy, 0 when awake. */
export function slimeStarScale(state: SlimeRuntime): number {
  if (state.stunRemainingS > 0) return 1;
  if (!state.groggy) return 0;
  const t = state.groggyElapsedS / SLIME_GROGGY_STAR_FADE_S;
  if (t <= 0) return 1;
  if (t >= 1) return SLIME_GROGGY_STAR_MIN_SCALE;
  return 1 - (1 - SLIME_GROGGY_STAR_MIN_SCALE) * t;
}

export function slimeStarsVisible(state: SlimeRuntime): boolean {
  return state.stunRemainingS > 0 || state.groggy;
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
