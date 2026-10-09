import type { WorldPose } from '../placement/pose';

/** How the explorer traverses a path segment. */
export type TraversalKind =
  'walk' | 'plank_bridge' | 'ramp' | 'gate' | 'portal' | 'moving_platform';

/** Runtime blocker the explorer waits on before crossing a segment. */
export type PathBlocker =
  | 'unbuiltGap'
  | 'closedGate'
  | 'awakeSlime'
  | 'unalignedPlatform';

/** A world-space stop on the explorer's route. */
export interface ExplorerWaypoint {
  surfaceId: string;
  pose: WorldPose;
  /** Placement at this pose, when the stop is a piece (hut, gem, gate, …). */
  placementId?: string;
}

/** Ordered hop between two waypoints. */
export interface ExplorerSegment {
  fromIndex: number;
  toIndex: number;
  kind: TraversalKind;
  /** Present when the hop is gated on a player action. */
  blocker?: PathBlocker;
  /** Placement that owns the hop (link, gate, or slime). */
  placementId?: string;
}

/** Solved start→goal route used by the kinematic walker. */
export interface ExplorerPath {
  waypoints: ExplorerWaypoint[];
  segments: ExplorerSegment[];
}
