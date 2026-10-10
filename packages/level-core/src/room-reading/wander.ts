import type { SurfaceGraph } from '@roomquest/schema';
import { placementToPose } from '../placement/pose';
import { bfsPath } from '../validate/graph-utils';
import type { ExplorerPath, ExplorerWaypoint } from '../path/types';

const EMPTY_WANDER: ExplorerPath = { waypoints: [], segments: [] };

/**
 * Undirected adjacency using only graph `adjacent` edges — no pieces yet,
 * so plank/ramp/portal hops are not walkable during room-reading.
 */
export function adjacentSurfaceAdjacency(
  graph: SurfaceGraph
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    adj.set(node.id, new Set());
  }
  for (const edge of graph.edges) {
    if (edge.kind !== 'adjacent') {
      continue;
    }
    adj.get(edge.a)?.add(edge.b);
    adj.get(edge.b)?.add(edge.a);
  }
  return adj;
}

/**
 * Shortest adjacent-only walk as an {@link ExplorerPath}, so the XR walker
 * can reuse `explorerPath` movement. `null` when `toId` is unreachable
 * (caller should only face the target).
 */
export function wanderPath(
  graph: SurfaceGraph,
  fromId: string,
  toId: string
): ExplorerPath | null {
  if (!graph.nodes.some((node) => node.id === fromId)) {
    return null;
  }
  if (!graph.nodes.some((node) => node.id === toId)) {
    return null;
  }
  const ids = bfsPath(fromId, toId, adjacentSurfaceAdjacency(graph));
  if (!ids) {
    return null;
  }
  return wanderPathFromIds(graph, ids);
}

export function wanderPathFromIds(
  graph: SurfaceGraph,
  surfaceIds: readonly string[]
): ExplorerPath {
  if (surfaceIds.length === 0) {
    return EMPTY_WANDER;
  }
  const waypoints: ExplorerWaypoint[] = [];
  for (const surfaceId of surfaceIds) {
    waypoints.push({
      surfaceId,
      pose: placementToPose(graph, { surface: surfaceId, u: 0.5, v: 0.5 }),
    });
  }
  const segments: ExplorerPath['segments'] = [];
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    segments.push({
      fromIndex: i,
      toIndex: i + 1,
      kind: 'walk',
    });
  }
  return { waypoints, segments };
}
