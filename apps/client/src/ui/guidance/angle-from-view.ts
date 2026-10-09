/**
 * Viewer-relative angles for gaze dwell and the FoV edge arrow (F-06).
 * Number-only API: callers reuse buffers; this module allocates nothing.
 */

/** Explorer is out of view when the angle from view centre exceeds this. */
export const OUT_OF_VIEW_DEG = 50;

/** Half-angle of the head-gaze dwell cone on the explorer, degrees. */
export const DWELL_CONE_DEG = 12;

const DEG = 180 / Math.PI;
const EPS = 1e-8;

export function angleFromViewDeg(
  ox: number,
  oy: number,
  oz: number,
  fx: number,
  fy: number,
  fz: number,
  tx: number,
  ty: number,
  tz: number
): number {
  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const dLen = Math.hypot(dx, dy, dz);
  if (dLen < EPS) return 0;
  const fLen = Math.hypot(fx, fy, fz);
  if (fLen < EPS) return 180;
  const dot = (dx * fx + dy * fy + dz * fz) / (dLen * fLen);
  const clamped = dot < -1 ? -1 : dot > 1 ? 1 : dot;
  return Math.acos(clamped) * DEG;
}

export function isOutOfView(angleDeg: number, limitDeg = OUT_OF_VIEW_DEG): boolean {
  return angleDeg > limitDeg;
}

export function isLookingAtExplorer(
  angleDeg: number,
  coneDeg = DWELL_CONE_DEG
): boolean {
  return angleDeg <= coneDeg;
}

export interface EdgeArrowPose {
  x: number;
  y: number;
  z: number;
  /** Roll around the view axis, radians. 0 = right, +π/2 = up. */
  roll: number;
}

/**
 * Place an arrow on a ring in front of the viewer, toward the explorer.
 * Writes into `out` (no allocation).
 */
export function writeEdgeArrowPose(
  ox: number,
  oy: number,
  oz: number,
  fx: number,
  fy: number,
  fz: number,
  tx: number,
  ty: number,
  tz: number,
  distanceM: number,
  radiusM: number,
  out: EdgeArrowPose
): void {
  const fLen = Math.hypot(fx, fy, fz);
  const nx = fLen < EPS ? 0 : fx / fLen;
  const ny = fLen < EPS ? 0 : fy / fLen;
  const nz = fLen < EPS ? -1 : fz / fLen;

  let rx = -nz;
  let ry = 0;
  let rz = nx;
  let rLen = Math.hypot(rx, ry, rz);
  if (rLen < EPS) {
    rx = 1;
    ry = 0;
    rz = 0;
    rLen = 1;
  } else {
    rx /= rLen;
    ry /= rLen;
    rz /= rLen;
  }

  const ux = ry * nz - rz * ny;
  const uy = rz * nx - rx * nz;
  const uz = rx * ny - ry * nx;

  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const sx = dx * rx + dy * ry + dz * rz;
  const sy = dx * ux + dy * uy + dz * uz;
  const sLen = Math.hypot(sx, sy);
  const px = sLen < EPS ? 1 : sx / sLen;
  const py = sLen < EPS ? 0 : sy / sLen;

  out.x = ox + nx * distanceM + rx * px * radiusM + ux * py * radiusM;
  out.y = oy + ny * distanceM + ry * px * radiusM + uy * py * radiusM;
  out.z = oz + nz * distanceM + rz * px * radiusM + uz * py * radiusM;
  out.roll = Math.atan2(py, px);
}
