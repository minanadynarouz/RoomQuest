import type { Placement, SurfaceGraph } from '@roomquest/schema';
import { placementToPose } from '../placement/pose';
import { MAX_RAIL_LENGTH_M, PLATFORM_ALIGN_EPS_M } from './constants';
import type { PlatformRail, RailSample, Vec3Mut } from './types';

const AXIS_EPS = 1e-8;

/**
 * Clamp a proposed rail length to (0, {@link MAX_RAIL_LENGTH_M}].
 */
export function clampRailLength(length: number): number {
  if (!(length > 0)) return 0;
  return length > MAX_RAIL_LENGTH_M ? MAX_RAIL_LENGTH_M : length;
}

/**
 * Write a unit axis into `out`. Degenerate vectors become +X.
 */
export function writeUnitAxis(
  dx: number,
  dy: number,
  dz: number,
  out: Vec3Mut
): Vec3Mut {
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < AXIS_EPS) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    return out;
  }
  const inv = 1 / len;
  out[0] = dx * inv;
  out[1] = dy * inv;
  out[2] = dz * inv;
  return out;
}

/**
 * Build a rail from `from` (boarding) toward `to` (exit), length ≤ 1 m.
 * Aligns at t = 0; far end at t = length. Writes into caller-owned `out`.
 */
export function makeRail(
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number,
  out: PlatformRail
): PlatformRail {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dz = toZ - fromZ;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const length = clampRailLength(dist);
  writeUnitAxis(dx, dy, dz, out.axis);
  out.origin[0] = fromX;
  out.origin[1] = fromY;
  out.origin[2] = fromZ;
  out.length = length;
  out.alignT = 0;
  out.farT = length;
  return out;
}

export function emptyRail(): PlatformRail {
  return {
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    length: 0,
    alignT: 0,
    farT: 0,
  };
}

export function emptyRailSample(): RailSample {
  return { x: 0, y: 0, z: 0, t: 0, aligned: false };
}

/**
 * Project `(x,y,z)` onto the rail segment and write the clamped pose.
 * `out` is caller-owned — no allocation.
 */
export function clampToRail(
  x: number,
  y: number,
  z: number,
  rail: PlatformRail,
  out: RailSample,
  alignEps = PLATFORM_ALIGN_EPS_M
): RailSample {
  const ox = rail.origin[0];
  const oy = rail.origin[1];
  const oz = rail.origin[2];
  const ax = rail.axis[0];
  const ay = rail.axis[1];
  const az = rail.axis[2];
  let t = (x - ox) * ax + (y - oy) * ay + (z - oz) * az;
  if (t < 0) t = 0;
  else if (t > rail.length) t = rail.length;
  out.t = t;
  out.x = ox + ax * t;
  out.y = oy + ay * t;
  out.z = oz + az * t;
  out.aligned = isSampleAligned(out, rail, alignEps);
  return out;
}

/**
 * True when the (already clamped) sample is within `alignEps` of the boarding pose.
 */
export function isSampleAligned(
  sample: Pick<RailSample, 'x' | 'y' | 'z'>,
  rail: PlatformRail,
  alignEps = PLATFORM_ALIGN_EPS_M
): boolean {
  const ax = rail.origin[0] + rail.axis[0] * rail.alignT;
  const ay = rail.origin[1] + rail.axis[1] * rail.alignT;
  const az = rail.origin[2] + rail.axis[2] * rail.alignT;
  const dx = sample.x - ax;
  const dy = sample.y - ay;
  const dz = sample.z - az;
  return dx * dx + dy * dy + dz * dz <= alignEps * alignEps;
}

export function isPlatformAligned(
  x: number,
  y: number,
  z: number,
  rail: PlatformRail,
  alignEps = PLATFORM_ALIGN_EPS_M
): boolean {
  const dx = x - (rail.origin[0] + rail.axis[0] * rail.alignT);
  const dy = y - (rail.origin[1] + rail.axis[1] * rail.alignT);
  const dz = z - (rail.origin[2] + rail.axis[2] * rail.alignT);
  return dx * dx + dy * dy + dz * dz <= alignEps * alignEps;
}

/** Write `origin + t * axis` into `out`. `t` is clamped to the rail. */
export function railPoint(rail: PlatformRail, t: number, out: Vec3Mut): Vec3Mut {
  let u = t;
  if (u < 0) u = 0;
  else if (u > rail.length) u = rail.length;
  out[0] = rail.origin[0] + rail.axis[0] * u;
  out[1] = rail.origin[1] + rail.axis[1] * u;
  out[2] = rail.origin[2] + rail.axis[2] * u;
  return out;
}

/**
 * Rail for a `moving_platform` placement. Boarding pose is the piece UV;
 * the far end aims at `to` (or along the surface width if `to` is absent).
 */
export function buildPlatformRail(
  graph: SurfaceGraph,
  placement: Placement,
  out: PlatformRail
): PlatformRail | null {
  if (placement.piece !== 'moving_platform') {
    return null;
  }
  const from = placementToPose(graph, placement);
  if (placement.to) {
    const to = placementToPose(graph, {
      surface: placement.to,
      u: 0.5,
      v: 0.5,
    });
    return makeRail(
      from.position[0],
      from.position[1],
      from.position[2],
      to.position[0],
      to.position[1],
      to.position[2],
      out
    );
  }
  const node = graph.nodes.find((n) => n.id === placement.surface);
  if (!node) {
    return null;
  }
  const yaw = node.yaw;
  const usable = Math.max(0, node.size[0] - 0.06);
  const length = clampRailLength(usable);
  out.origin[0] = from.position[0];
  out.origin[1] = from.position[1];
  out.origin[2] = from.position[2];
  out.axis[0] = Math.cos(yaw);
  out.axis[1] = 0;
  out.axis[2] = Math.sin(yaw);
  out.length = length;
  out.alignT = 0;
  out.farT = length;
  return out;
}
