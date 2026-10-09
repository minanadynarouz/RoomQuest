/** Mutable XYZ used as an out-parameter (no per-frame allocation). */
export type Vec3Mut = [number, number, number];

/** World-space rail the moving platform is clamped to. */
export interface PlatformRail {
  origin: Vec3Mut;
  /** Unit direction from origin toward the far end. */
  axis: Vec3Mut;
  /** Clamped to {@link MAX_RAIL_LENGTH_M}. */
  length: number;
  /** Metres along the rail where the explorer boards. */
  alignT: number;
  /** Metres along the rail where the explorer exits. */
  farT: number;
}

/** Result of projecting a point onto a rail. Caller owns `out`. */
export interface RailSample {
  x: number;
  y: number;
  z: number;
  t: number;
  aligned: boolean;
}

/** One portal pair (max 1 per level). `bId` may equal `aId` for a single piece. */
export interface PortalPair {
  aId: string;
  bId: string;
}
