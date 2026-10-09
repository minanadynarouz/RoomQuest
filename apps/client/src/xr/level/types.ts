import type { PieceId, Placement } from '@roomquest/schema';
import type { WorldPose } from '@roomquest/level-core';
import type { Object3D } from '@iwsdk/core';

/** Snap target recorded for X-04. Surface pose of a player-built piece. */
export interface SnapTarget {
  placementId: string;
  piece: PieceId;
  pose: WorldPose;
  to?: string;
}

export interface MountedPiece {
  placement: Placement;
  object: Object3D;
  pose: WorldPose;
  inTray: boolean;
}

export interface LevelBuiltDetail {
  pieceCount: number;
  snapTargets: SnapTarget[];
}
