/** Explorer is out of view when the angle from camera forward exceeds this. */
export const EXPLORER_OUT_OF_VIEW_DEG = 60;

export type Vec3 = readonly [number, number, number];

function length3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * True when the explorer lies more than {@link EXPLORER_OUT_OF_VIEW_DEG}
 * off the camera forward axis.
 */
const TO_EXPLORER: [number, number, number] = [0, 0, 0];

export function isExplorerOutOfView(
  cameraPos: Vec3,
  cameraForward: Vec3,
  explorerPos: Vec3
): boolean {
  TO_EXPLORER[0] = explorerPos[0] - cameraPos[0];
  TO_EXPLORER[1] = explorerPos[1] - cameraPos[1];
  TO_EXPLORER[2] = explorerPos[2] - cameraPos[2];
  const toLen = length3(TO_EXPLORER);
  const fwdLen = length3(cameraForward);
  if (toLen < 1e-8 || fwdLen < 1e-8) {
    return false;
  }
  const dot = dot3(TO_EXPLORER, cameraForward) / (toLen * fwdLen);
  const clamped = Math.min(1, Math.max(-1, dot));
  const angleDeg = (Math.acos(clamped) * 180) / Math.PI;
  return angleDeg > EXPLORER_OUT_OF_VIEW_DEG;
}
