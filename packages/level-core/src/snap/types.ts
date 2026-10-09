import type { PieceId } from '@roomquest/schema';

/**
 * Minimal snap-target shape used by {@link findNearestSnapTarget}.
 * Matches the client's `SnapTarget` so the XR hot path can pass the
 * live array through with no per-frame mapping.
 */
export interface SnapSearchTarget {
  placementId: string;
  piece: PieceId;
  filled: boolean;
  pose: {
    position: readonly [number, number, number];
  };
}
