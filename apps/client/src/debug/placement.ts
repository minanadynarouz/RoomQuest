/**
 * Debug overlay pose: to the right of the F-04 HUD, still readable.
 */

export type DebugVec3 = readonly [number, number, number];

/** Head-local offset, metres. Right / below eye / forward. */
export const DEBUG_PANEL_OFFSET: DebugVec3 = [0.26, -0.28, -0.82];

export const DEBUG_PANEL_SCALE = 0.13;

export const DEBUG_FOLLOW_MAX_ANGLE_DEG = 30;

export const DEBUG_UI_THROTTLE_MS = 250;
