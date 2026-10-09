/** Stun length in seconds (PRD §4.2 / X-08). Driven by injected delta time. */
export const SLIME_STUN_DURATION_S = 4;

/** Patrol speed along the surface-local segment, metres per second. */
export const SLIME_PATROL_SPEED_MPS = 0.08;

/** Minimum surface area for a slime (KIT_CATALOG / PRD §4.2). */
export const SLIME_MIN_SURFACE_AREA_M2 = 0.5;

/** Greybox body width used to keep the patrol inset from the surface edge. */
export const SLIME_BODY_WIDTH_M = 0.1;

/** Peak Y-scale while stunned (non-violent squish). */
export const SLIME_SQUISH_SCALE_Y = 0.42;

/** X/Z stretch while stunned (paired with {@link SLIME_SQUISH_SCALE_Y}). */
export const SLIME_SQUISH_STRETCH = 1.14;

/**
 * Y-scale while groggy: still squashed so the merged eye boxes read as
 * half-closed lids. Pops to 1 only after the explorer leaves the zone.
 */
export const SLIME_GROGGY_SCALE_Y = 0.52;

/** X/Z stretch while groggy. */
export const SLIME_GROGGY_STRETCH = 1.08;

/** Forward slump (radians) while groggy. */
export const SLIME_GROGGY_TILT_RAD = 0.28;

/** Injected-dt window over which groggy stars shrink. */
export const SLIME_GROGGY_STAR_FADE_S = 1.25;

/** Floor for fading groggy stars (never 0 — still the stunned tell). */
export const SLIME_GROGGY_STAR_MIN_SCALE = 0.28;

/**
 * Extra metres around the surface top-face so a blocked explorer waiting
 * on the same table stays inside the groggy occupancy box.
 */
export const SLIME_ZONE_PAD_M = 0.28;

/** Vertical occupancy window around the slime home, metres. */
export const SLIME_ZONE_HEIGHT_M = 0.35;

/** Cartoon stars around a stunned slime. */
export const SLIME_STAR_COUNT = 5;

/** Star orbit radius in metres. */
export const SLIME_STAR_RADIUS_M = 0.055;

/** Star height above the slime base in metres. */
export const SLIME_STAR_HEIGHT_M = 0.09;

/** Star orbit speed in radians per second. */
export const SLIME_STAR_SPIN_RAD_S = 2.4;
