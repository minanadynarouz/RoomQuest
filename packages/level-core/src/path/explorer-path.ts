import type { LevelPlan, Placement, SurfaceGraph } from '@roomquest/schema';
import { placementToPose, type WorldPose } from '../placement/pose';
import {
  bfsPath,
  explorerAdjacency,
  indexNodes,
} from '../validate/graph-utils';
import type {
  ExplorerPath,
  ExplorerSegment,
  ExplorerWaypoint,
  PathBlocker,
  TraversalKind,
} from './types';

const EMPTY_PATH: ExplorerPath = { waypoints: [], segments: [] };

const LINK_KIND: Partial<Record<Placement['piece'], TraversalKind>> = {
  plank_bridge: 'plank_bridge',
  ramp: 'ramp',
  portal: 'portal',
  moving_platform: 'moving_platform',
  gate: 'gate',
};

interface SurfacePoi {
  placement: Placement;
  pose: WorldPose;
}

/**
 * Ordered waypoints and tagged segments for the explorer, following the
 * solvability BFS over surfaces plus built links.
 */
export function explorerPath(
  plan: LevelPlan,
  graph: SurfaceGraph
): ExplorerPath {
  const nodes = indexNodes(graph);
  if (!nodes.has(plan.start) || !nodes.has(plan.goal)) {
    return EMPTY_PATH;
  }

  const builtIds = new Set<string>();
  const openGateIds = new Set<string>();
  for (const placement of plan.placements) {
    if (LINK_KIND[placement.piece] && placement.piece !== 'gate') {
      builtIds.add(placement.id);
    }
    if (placement.piece === 'gate') {
      openGateIds.add(placement.id);
    }
  }

  const adj = explorerAdjacency(plan, graph, { builtIds, openGateIds });
  const surfaces = bfsPath(plan.start, plan.goal, adj);
  if (!surfaces || surfaces.length === 0) {
    return EMPTY_PATH;
  }

  const waypoints: ExplorerWaypoint[] = [];
  const segments: ExplorerSegment[] = [];

  const hut = findPieceOn(plan, 'village_hut', plan.start);
  const startPose = hut
    ? placementToPose(graph, hut)
    : surfaceCenterPose(graph, plan.start);
  pushWaypoint(waypoints, {
    surfaceId: plan.start,
    pose: startPose,
    placementId: hut?.id,
  });

  for (let i = 0; i < surfaces.length; i += 1) {
    const surfaceId = surfaces[i];
    if (surfaceId === undefined) {
      continue;
    }
    const nextId = surfaces[i + 1];
    const link =
      nextId === undefined ? null : findConnectingLink(plan, surfaceId, nextId);

    const pois = collectPois(plan, graph, surfaceId, link?.placement?.id);
    const fromPose = waypoints[waypoints.length - 1]?.pose ?? startPose;
    pois.sort(
      (a, b) => poseDistance(fromPose, a.pose) - poseDistance(fromPose, b.pose)
    );

    for (const poi of pois) {
      const fromIndex = waypoints.length - 1;
      const toIndex = pushWaypoint(waypoints, {
        surfaceId,
        pose: poi.pose,
        placementId: poi.placement.id,
      });
      const kind: TraversalKind =
        poi.placement.piece === 'gate' ? 'gate' : 'walk';
      const blocker = poiBlocker(poi.placement);
      pushSegment(segments, fromIndex, toIndex, kind, {
        blocker,
        placementId: poi.placement.id,
      });
    }

    if (nextId !== undefined && link) {
      const exitPose = link.placement
        ? placementToPose(graph, link.placement)
        : surfaceCenterPose(graph, surfaceId);
      const fromExit = waypoints.length - 1;
      const exitIndex = pushWaypoint(waypoints, {
        surfaceId,
        pose: exitPose,
        placementId: link.placement?.id,
      });
      pushSegment(segments, fromExit, exitIndex, 'walk', {});

      const landPose = landingPose(graph, nextId, surfaceId);
      const landIndex = pushWaypoint(waypoints, {
        surfaceId: nextId,
        pose: landPose,
      });
      pushSegment(segments, exitIndex, landIndex, link.kind, {
        blocker: linkBlocker(link.placement, link.kind),
        placementId: link.placement?.id,
      });
    }
  }

  const shrine = findPieceOn(plan, 'crystal_shrine', plan.goal);
  if (shrine) {
    const shrinePose = placementToPose(graph, shrine);
    const fromShrine = waypoints.length - 1;
    const shrineIndex = pushWaypoint(waypoints, {
      surfaceId: plan.goal,
      pose: shrinePose,
      placementId: shrine.id,
    });
    pushSegment(segments, fromShrine, shrineIndex, 'walk', {
      placementId: shrine.id,
    });
  }

  return { waypoints, segments };
}

function findPieceOn(
  plan: LevelPlan,
  piece: Placement['piece'],
  surfaceId: string
): Placement | undefined {
  for (const placement of plan.placements) {
    if (placement.piece === piece && placement.surface === surfaceId) {
      return placement;
    }
  }
  return undefined;
}

function collectPois(
  plan: LevelPlan,
  graph: SurfaceGraph,
  surfaceId: string,
  skipId: string | undefined
): SurfacePoi[] {
  const pois: SurfacePoi[] = [];
  for (const placement of plan.placements) {
    if (placement.surface !== surfaceId) {
      continue;
    }
    if (placement.id === skipId) {
      continue;
    }
    if (
      placement.piece !== 'gem' &&
      placement.piece !== 'gate' &&
      placement.piece !== 'slime'
    ) {
      continue;
    }
    pois.push({
      placement,
      pose: placementToPose(graph, placement),
    });
  }
  return pois;
}

function findConnectingLink(
  plan: LevelPlan,
  from: string,
  to: string
): { kind: TraversalKind; placement?: Placement } | null {
  for (const placement of plan.placements) {
    if (!connects(placement, from, to)) {
      continue;
    }
    const kind = LINK_KIND[placement.piece];
    if (kind) {
      return { kind, placement };
    }
  }
  return { kind: 'walk' };
}

function connects(placement: Placement, a: string, b: string): boolean {
  if (!placement.to) {
    return false;
  }
  return (
    (placement.surface === a && placement.to === b) ||
    (placement.surface === b && placement.to === a)
  );
}

function poiBlocker(placement: Placement): PathBlocker | undefined {
  if (placement.piece === 'gate') {
    return 'closedGate';
  }
  if (placement.piece === 'slime') {
    return 'awakeSlime';
  }
  return undefined;
}

function linkBlocker(
  placement: Placement | undefined,
  kind: TraversalKind
): PathBlocker | undefined {
  if (kind === 'gate') {
    return 'closedGate';
  }
  if (kind === 'moving_platform') {
    if (placement?.playerBuilt) {
      return 'unbuiltGap';
    }
    return 'unalignedPlatform';
  }
  if (
    placement?.playerBuilt &&
    (kind === 'plank_bridge' || kind === 'ramp' || kind === 'portal')
  ) {
    return 'unbuiltGap';
  }
  return undefined;
}

function surfaceCenterPose(graph: SurfaceGraph, surfaceId: string): WorldPose {
  return placementToPose(graph, { surface: surfaceId, u: 0.5, v: 0.5 });
}

function landingPose(
  graph: SurfaceGraph,
  onto: string,
  from: string
): WorldPose {
  const ontoNode = graph.nodes.find((n) => n.id === onto);
  const fromNode = graph.nodes.find((n) => n.id === from);
  if (!ontoNode || !fromNode) {
    return surfaceCenterPose(graph, onto);
  }
  const dx = fromNode.centroid[0] - ontoNode.centroid[0];
  const dz = fromNode.centroid[2] - ontoNode.centroid[2];
  const width = ontoNode.size[0];
  const depth = ontoNode.size[1];
  const cos = Math.cos(-ontoNode.yaw);
  const sin = Math.sin(-ontoNode.yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const u = clamp01(0.5 + localX / Math.max(width, 1e-6));
  const v = clamp01(0.5 + localZ / Math.max(depth, 1e-6));
  return placementToPose(graph, { surface: onto, u, v });
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function poseDistance(a: WorldPose, b: WorldPose): number {
  const dx = a.position[0] - b.position[0];
  const dy = a.position[1] - b.position[1];
  const dz = a.position[2] - b.position[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function pushWaypoint(
  waypoints: ExplorerWaypoint[],
  waypoint: ExplorerWaypoint
): number {
  const last = waypoints[waypoints.length - 1];
  if (last && sameWaypoint(last, waypoint)) {
    if (waypoint.placementId && !last.placementId) {
      last.placementId = waypoint.placementId;
    }
    return waypoints.length - 1;
  }
  waypoints.push(waypoint);
  return waypoints.length - 1;
}

function sameWaypoint(a: ExplorerWaypoint, b: ExplorerWaypoint): boolean {
  if (a.surfaceId !== b.surfaceId) {
    return false;
  }
  if (a.placementId && b.placementId && a.placementId === b.placementId) {
    return true;
  }
  const dx = a.pose.position[0] - b.pose.position[0];
  const dy = a.pose.position[1] - b.pose.position[1];
  const dz = a.pose.position[2] - b.pose.position[2];
  return dx * dx + dy * dy + dz * dz < 1e-8;
}

function pushSegment(
  segments: ExplorerSegment[],
  fromIndex: number,
  toIndex: number,
  kind: TraversalKind,
  extra: { blocker?: PathBlocker; placementId?: string }
): void {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return;
  }
  const segment: ExplorerSegment = { fromIndex, toIndex, kind };
  if (extra.blocker) {
    segment.blocker = extra.blocker;
  }
  if (extra.placementId) {
    segment.placementId = extra.placementId;
  }
  segments.push(segment);
}
