import type { Placement, SurfaceGraph, SurfaceNode } from '@roomquest/schema';

/** Inset from each edge of the top face, in metres (Architecture §7). */
export const SURFACE_INSET_M = 0.03;

/** Surface-local UV used by {@link placementToPose}. Extra Placement fields are ignored. */
export type PlacementUv = Pick<Placement, 'surface' | 'u' | 'v'>;

/**
 * World pose of a piece sitting on a surface top face.
 * `yaw` is the surface yaw (radians); the piece inherits it.
 */
export interface WorldPose {
  position: [number, number, number];
  yaw: number;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function requireNode(graph: SurfaceGraph, surfaceId: string): SurfaceNode {
  const node = graph.nodes.find((n) => n.id === surfaceId);
  if (!node) {
    throw new Error(`Unknown surface "${surfaceId}"`);
  }
  return node;
}

/**
 * Map a placement's `(surface, u, v)` to a world pose on the surface top.
 *
 * - `u` runs along the top-face width (`size[0]`), `v` along depth (`size[1]`).
 * - Both axes are inset by {@link SURFACE_INSET_M} (3 cm) from the edges, then
 *   `u,v ∈ [0,1]` span the remaining usable rectangle. Values outside `[0,1]`
 *   are clamped. If the face is smaller than 6 cm on an axis, that axis
 *   collapses to the centroid (inset clamp).
 * - `x,z` are rotated by the surface yaw about Y around the centroid.
 * - `y` is the surface top: `floorY + topHeight`.
 */
export function placementToPose(
  graph: SurfaceGraph,
  placement: PlacementUv
): WorldPose {
  const node = requireNode(graph, placement.surface);
  const u = clamp01(placement.u);
  const v = clamp01(placement.v);
  const width = node.size[0];
  const depth = node.size[1];

  const usableWidth = Math.max(0, width - 2 * SURFACE_INSET_M);
  const usableDepth = Math.max(0, depth - 2 * SURFACE_INSET_M);

  const localX = (u - 0.5) * usableWidth;
  const localZ = (v - 0.5) * usableDepth;

  const cos = Math.cos(node.yaw);
  const sin = Math.sin(node.yaw);

  const x = node.centroid[0] + localX * cos - localZ * sin;
  const z = node.centroid[2] + localX * sin + localZ * cos;
  const y = graph.floorY + node.topHeight;

  return {
    position: [x, y, z],
    yaw: node.yaw,
  };
}
