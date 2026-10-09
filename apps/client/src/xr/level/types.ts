import type { PieceId, Placement } from '@roomquest/schema';
import type { WorldPose } from '@roomquest/level-core';
import type { Object3D } from '@iwsdk/core';

/** Snap target recorded for X-04. Surface pose of a player-built piece. */
export interface SnapTarget {
  placementId: string;
  piece: PieceId;
  pose: WorldPose;
  filled: boolean;
  to?: string;
}

export interface TraySlot {
  x: number;
  y: number;
  z: number;
}

export interface MountedPiece {
  placement: Placement;
  object: Object3D;
  pose: WorldPose;
  inTray: boolean;
  traySlot: TraySlot;
}

export interface LevelBuiltDetail {
  pieceCount: number;
  snapTargets: SnapTarget[];
}
