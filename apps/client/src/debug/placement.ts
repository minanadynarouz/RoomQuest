/**
 * Debug overlay pose: to the right of the F-04 HUD, still readable.
 */

export type DebugVec3 = readonly [number, number, number];

/** Head-local offset, metres. Right / below the HUD / forward. */
export const DEBUG_PANEL_OFFSET: DebugVec3 = [0.4, -0.4, -0.78];

export const DEBUG_PANEL_SCALE = 0.14;

export const DEBUG_FOLLOW_MAX_ANGLE_DEG = 30;

export const DEBUG_UI_THROTTLE_MS = 250;
