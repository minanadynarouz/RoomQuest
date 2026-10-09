/**
 * HUD placement helpers (F-04).
 *
 * Panels sit 0.6–1 m from the viewer, below eye line, and no more than
 * 50° from seated forward. Pure math: no DOM or IWSDK.
 */

/** Comfortable leash distance from the head, metres. */
export const HUD_DISTANCE_M = 0.8;

/** Drop below the eye line, metres (head-local −Y). */
export const HUD_DROP_M = 0.16;

/** Horizontal dead-zone before a leashed panel re-targets, degrees. */
export const HUD_FOLLOW_MAX_ANGLE_DEG = 30;

/** Hard layout limit from the seated-forward rule. */
export const HUD_MAX_ANGLE_FROM_FORWARD_DEG = 50;

/** Minimum readable distance, metres. */
export const HUD_MIN_DISTANCE_M = 0.6;

/** Maximum comfortable reading distance, metres. */
export const HUD_MAX_DISTANCE_M = 1;

/**
 * World-space width of a UIKitML panel: CSS `width` in UIKit centimetres
 * times the entity scale. Welcome-panel uses 344 cm at scale 0.4 at ~2 m;
 * these scales keep a similar angular size at {@link HUD_DISTANCE_M}.
 */
export const HUD_MODAL_SCALE = 0.16;
export const HUD_CHIP_SCALE = 0.14;
export const HUD_DIALOGUE_SCALE = 0.14;

/** Dialogue bubble height above the explorer stub, metres. */
export const DIALOGUE_HEIGHT_M = 0.2;

/** Stub explorer distance from the head, metres. */
export const EXPLORER_STUB_DISTANCE_M = 0.75;

/** Stub explorer drop below eye line, metres. */
export const EXPLORER_STUB_DROP_M = 0.35;

export type Vec3 = readonly [number, number, number];

export interface HudPoseCheck {
  angleDeg: number;
  distanceM: number;
  belowEye: boolean;
  withinAngle: boolean;
  withinDistance: boolean;
  ok: boolean;
}

function length3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize3(v: Vec3): Vec3 {
  const len = length3(v);
  if (len === 0) return [0, 0, -1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Angle in degrees between two directions, clamped for `acos` safety.
 */
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const na = normalize3(a);
  const nb = normalize3(b);
  const dot = Math.min(1, Math.max(-1, dot3(na, nb)));
  return (Math.acos(dot) * 180) / Math.PI;
}

/**
 * Check that a panel pose is readable (0.6–1 m), below the eye line, and
 * within 50° of the seated forward vector.
 */
export function checkHudPose(
  eyePosition: Vec3,
  forward: Vec3,
  panelPosition: Vec3
): HudPoseCheck {
  const offset = sub3(panelPosition, eyePosition);
  const distanceM = length3(offset);
  const angleDeg = angleBetweenDeg(forward, offset);
  const belowEye = panelPosition[1] <= eyePosition[1];
  const withinAngle = angleDeg <= HUD_MAX_ANGLE_FROM_FORWARD_DEG;
  const withinDistance =
    distanceM >= HUD_MIN_DISTANCE_M && distanceM <= HUD_MAX_DISTANCE_M;
  return {
    angleDeg,
    distanceM,
    belowEye,
    withinAngle,
    withinDistance,
    ok: belowEye && withinAngle && withinDistance,
  };
}

/**
 * Head-local offset for a leashed HUD panel: forward (−Z) and below eye (−Y).
 */
export function leashedHudOffset(
  distanceM = HUD_DISTANCE_M,
  dropM = HUD_DROP_M
): Vec3 {
  return [0, -dropM, -distanceM];
}
