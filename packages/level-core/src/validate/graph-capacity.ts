import { KIT_CATALOG, type SurfaceGraph, type SurfaceNode } from '@roomquest/schema';
import {
  horizontalDistance,
  isPlayerReachable,
  MAX_VIEW_ANGLE_DEG,
  MIN_PATH_DISTANCE_M,
} from './graph-utils';

const HUT = KIT_CATALOG.village_hut;

/**
 * Minimum graph for a full-quality (non-degraded) plan:
 *
 * - ≥ 2 surfaces
 * - ≥ 1 table/desk that meets `village_hut` catalog constraints
 *   (area, height, ≤ 50° FoV)
 * - ≥ 1 pair of surfaces ≥ {@link MIN_PATH_DISTANCE_M} apart horizontally
 *
 * Below that, generate/repair still emit a schema-valid degraded plan
 * rather than an invalid one. IWER `meeting_room` (3 stacked surfaces,
 * max pair 0.17 m) is the compact case. Several IWER captures have no
 * in-cone table; those skip hut FoV/height and, when *every* surface is
 * out of view, portal FoV so the scanned topology stays walkable.
 */
export function isTableLike(node: SurfaceNode): boolean {
  return HUT.allowedSurfaces?.includes(node.label) ?? false;
}

/** True when `node` satisfies every village_hut catalog constraint. */
export function isCatalogHut(node: SurfaceNode): boolean {
  if (!isTableLike(node)) {
    return false;
  }
  if (HUT.minArea !== undefined && node.area < HUT.minArea) {
    return false;
  }
  if (HUT.minHeight !== undefined && node.topHeight < HUT.minHeight) {
    return false;
  }
  if (HUT.maxHeight !== undefined && node.topHeight > HUT.maxHeight) {
    return false;
  }
  if (
    HUT.maxAngleFromForward !== undefined &&
    node.angleFromForward > HUT.maxAngleFromForward
  ) {
    return false;
  }
  return true;
}

export function graphHasCatalogHut(graph: SurfaceGraph): boolean {
  return graph.nodes.some((node) => isCatalogHut(node));
}

export function graphHasTableLike(graph: SurfaceGraph): boolean {
  return graph.nodes.some((node) => isTableLike(node));
}

/** A hand/ray surface inside the 50° play cone. */
export function graphHasPlayableView(graph: SurfaceGraph): boolean {
  return graph.nodes.some(
    (node) =>
      isPlayerReachable(node) && node.angleFromForward <= MAX_VIEW_ANGLE_DEG
  );
}

export function maxHorizontalPairDistance(graph: SurfaceGraph): number {
  let max = 0;
  const nodes = graph.nodes;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      if (!a || !b) {
        continue;
      }
      max = Math.max(max, horizontalDistance(a, b));
    }
  }
  return max;
}

export function graphCanSeparateHutAndShrine(graph: SurfaceGraph): boolean {
  return maxHorizontalPairDistance(graph) >= MIN_PATH_DISTANCE_M;
}

/**
 * Best hut surface: catalog-valid table/desk, then any table/desk
 * (prefer in-range height and smaller FoV angle), then largest node.
 */
export function pickHutSurface(
  nodes: readonly SurfaceNode[]
): SurfaceNode | undefined {
  if (nodes.length === 0) {
    return undefined;
  }
  const ranked = [...nodes].sort((a, b) => {
    const rank = hutRank(b) - hutRank(a);
    if (rank !== 0) {
      return rank;
    }
    const area = b.area - a.area;
    if (area !== 0) {
      return area;
    }
    return a.id.localeCompare(b.id);
  });
  return ranked[0];
}

function hutRank(node: SurfaceNode): number {
  if (!isTableLike(node)) {
    return 0;
  }
  let rank = 100;
  if (HUT.minArea === undefined || node.area >= HUT.minArea) {
    rank += 10;
  }
  if (HUT.minHeight === undefined || node.topHeight >= HUT.minHeight) {
    rank += 10;
  }
  if (HUT.maxHeight === undefined || node.topHeight <= HUT.maxHeight) {
    rank += 10;
  }
  const maxAngle = HUT.maxAngleFromForward ?? MAX_VIEW_ANGLE_DEG;
  if (node.angleFromForward <= maxAngle) {
    rank += 50;
  } else {
    rank -= Math.min(40, node.angleFromForward - maxAngle);
  }
  return rank;
}
