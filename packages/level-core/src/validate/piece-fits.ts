import {
  KIT_CATALOG,
  type PieceId,
  type SurfaceGraph,
  type SurfaceNode,
} from '@roomquest/schema';
import {
  findEdge,
  GEOM_EPS_M,
  isPlayerReachable,
  MAX_VIEW_ANGLE_DEG,
  pairMetrics,
} from './graph-utils';

/**
 * True when `checkSurfaceFits` in constraints.ts would report no issue
 * for `piece` on `surface` (label, height, area, view-angle, lever reach).
 */
export function pieceFitsSurface(piece: PieceId, surface: SurfaceNode): boolean {
  const catalog = KIT_CATALOG[piece];

  if (
    catalog.allowedSurfaces &&
    !catalog.allowedSurfaces.includes(surface.label)
  ) {
    return false;
  }
  if (
    catalog.minHeight !== undefined &&
    surface.topHeight < catalog.minHeight
  ) {
    return false;
  }
  if (
    catalog.maxHeight !== undefined &&
    surface.topHeight > catalog.maxHeight
  ) {
    return false;
  }
  if (catalog.minArea !== undefined && surface.area < catalog.minArea) {
    return false;
  }
  const maxAngle = catalog.maxAngleFromForward ?? undefined;
  if (maxAngle !== undefined && surface.angleFromForward > maxAngle) {
    return false;
  }
  if (piece === 'lever' && !isPlayerReachable(surface)) {
    return false;
  }
  return true;
}

/**
 * True when the pair checks in `constraints.ts` (gap, Δh, portal FoV,
 * ramp floor run) would accept `piece` between `from` and `to`.
 */
export function pairFitsPiece(
  piece: PieceId,
  from: SurfaceNode,
  to: SurfaceNode,
  graph: SurfaceGraph
): boolean {
  if (from.id === to.id) {
    return false;
  }
  const catalog = KIT_CATALOG[piece];
  const edge = findEdge(graph, from.id, to.id);
  const { gap, dh } = pairMetrics(from, to, edge);

  if (catalog.minGap !== undefined && gap < catalog.minGap - GEOM_EPS_M) {
    return false;
  }
  if (catalog.maxGap !== undefined && gap > catalog.maxGap + GEOM_EPS_M) {
    return false;
  }
  if (
    catalog.maxDeltaHeight !== undefined &&
    dh > catalog.maxDeltaHeight + GEOM_EPS_M
  ) {
    return false;
  }
  if (piece === 'portal' && to.angleFromForward > MAX_VIEW_ANGLE_DEG) {
    return false;
  }
  if (piece === 'ramp') {
    const floor =
      from.label === 'floor' ? from : to.label === 'floor' ? to : null;
    const run = floor
      ? Math.max(gap, Math.min(floor.size[0], floor.size[1]))
      : gap;
    if (run < 2 * dh) {
      return false;
    }
  }
  return true;
}
