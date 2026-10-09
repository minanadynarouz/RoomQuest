import type { PieceId } from '@roomquest/schema';
import { SNAP_RADIUS_M } from './constants';
import { isSnapCompatible } from './compatible';
import type { SnapSearchTarget } from './types';

/**
 * Nearest compatible unfilled snap target within `radiusM`, measured in
 * world space (Euclidean). Returns a reference into `targets` (no alloc).
 *
 * Tie-break: smaller squared distance wins; if distances are equal, the
 * smaller `placementId` wins so the result is stable.
 */
export function findNearestSnapTarget<T extends SnapSearchTarget>(
  heldPiece: PieceId,
  heldX: number,
  heldY: number,
  heldZ: number,
  targets: readonly T[],
  radiusM: number = SNAP_RADIUS_M
): T | null {
  const radiusSq = radiusM * radiusM;
  let best: T | null = null;
  let bestD2 = Infinity;
  let bestId = '';

  for (const target of targets) {
    if (target.filled) continue;
    if (!isSnapCompatible(heldPiece, target.piece)) continue;

    const p = target.pose.position;
    const dx = heldX - p[0];
    const dy = heldY - p[1];
    const dz = heldZ - p[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > radiusSq) continue;

    if (
      best === null ||
      d2 < bestD2 ||
      (d2 === bestD2 && target.placementId < bestId)
    ) {
      best = target;
      bestD2 = d2;
      bestId = target.placementId;
    }
  }

  return best;
}
