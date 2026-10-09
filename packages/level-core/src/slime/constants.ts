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

/** Cartoon stars around a stunned slime. */
export const SLIME_STAR_COUNT = 5;

/** Star orbit radius in metres. */
export const SLIME_STAR_RADIUS_M = 0.055;

/** Star height above the slime base in metres. */
export const SLIME_STAR_HEIGHT_M = 0.09;

/** Star orbit speed in radians per second. */
export const SLIME_STAR_SPIN_RAD_S = 2.4;
