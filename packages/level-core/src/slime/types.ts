/** Patrol axis in the surface's local top-face frame (u = width, v = depth). */
export type SlimePatrolAxis = 'u' | 'v';

/** Immutable per-slime patrol segment, derived once from the surface. */
export interface SlimePatrolConfig {
  halfLengthM: number;
  speedMps: number;
  axis: SlimePatrolAxis;
}

/**
 * Mutable slime runtime. Created once per placement; `tickSlime` writes
 * in place so the XR system never allocates per frame.
 */
export interface SlimeRuntime {
  placementId: string;
  /** Metres from the placement pose along `config.axis`. */
  offsetM: number;
  dir: 1 | -1;
  /** Remaining stun; `0` means awake. */
  stunRemainingS: number;
}

/** Result of one injected-dt tick. */
export type SlimeTickResult = 'awake' | 'stunned' | 'woke';

/** Caller-owned pose written by {@link writeStarPose}. */
export interface SlimeStarPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}
