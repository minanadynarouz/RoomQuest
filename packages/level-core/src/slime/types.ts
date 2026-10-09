/** Patrol axis in the surface's local top-face frame (u = width, v = depth). */
export type SlimePatrolAxis = 'u' | 'v';

/** Immutable per-slime patrol segment, derived once from the surface. */
export interface SlimePatrolConfig {
  halfLengthM: number;
  speedMps: number;
  axis: SlimePatrolAxis;
  /** Top-face width (u), metres. Occupancy uses this as the patrol zone. */
  surfaceWidthM: number;
  /** Top-face depth (v), metres. */
  surfaceDepthM: number;
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
  /** Remaining stun; `0` means the 4 s timer is done (may still be groggy). */
  stunRemainingS: number;
  /**
   * True after `slimeWoke` until the explorer leaves the patrol zone.
   * Visual stays squashed; patrol does not resume.
   */
  groggy: boolean;
  /** Injected-dt seconds spent groggy (star fade). */
  groggyElapsedS: number;
}

/**
 * Caller-owned explorer offset from the slime home, in the surface-local
 * top-face frame (same as {@link writePatrolLocalOffset}).
 */
export interface SlimeExplorerLocal {
  x: number;
  y: number;
  z: number;
}

/** Caller-owned body transform written by writeSlimeBodyScale. */
export interface SlimeBodyScale {
  x: number;
  y: number;
  z: number;
  tiltX: number;
}

/** Result of one injected-dt tick. */
export type SlimeTickResult =
  'awake' | 'stunned' | 'woke' | 'groggy' | 'cleared';

/** Caller-owned pose written by {@link writeStarPose}. */
export interface SlimeStarPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}
