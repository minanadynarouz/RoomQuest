import { PIECE_IDS, type PieceId, type SurfaceNode } from '@roomquest/schema';
import { SURFACE_INSET_M } from './pose';

/**
 * Axis-aligned top-face footprints (metres), matching the client greybox
 * kit (`apps/client/src/xr/pieces/*`). Used only for prompt hints and
 * local slot snapping — `validatePlan` still uses KIT_CATALOG.
 */
export interface PieceFootprint {
  w: number;
  d: number;
}

export const PIECE_FOOTPRINTS: Readonly<Record<PieceId, PieceFootprint>> = {
  village_hut: { w: 0.14, d: 0.14 },
  crystal_shrine: { w: 0.1, d: 0.1 },
  plank_bridge: { w: 0.4, d: 0.07 },
  ramp: { w: 0.1, d: 0.24 },
  moving_platform: { w: 0.18, d: 0.12 },
  gate: { w: 0.12, d: 0.04 },
  lever: { w: 0.05, d: 0.05 },
  gem: { w: 0.04, d: 0.04 },
  slime: { w: 0.1, d: 0.1 },
  portal: { w: 0.12, d: 0.04 },
};

export function pieceFootprint(piece: PieceId): PieceFootprint {
  return PIECE_FOOTPRINTS[piece];
}

/** Usable top-face width × depth after the 3 cm pose inset. */
export function usableSize(surface: SurfaceNode): [number, number] {
  return [
    Math.max(0, surface.size[0] - 2 * SURFACE_INSET_M),
    Math.max(0, surface.size[1] - 2 * SURFACE_INSET_M),
  ];
}

/**
 * Choose an axis-aligned orientation that fits `fp` on the usable face.
 * Natural (w along u) wins ties so the choice is deterministic.
 */
export function orientFootprint(
  fp: PieceFootprint,
  usableW: number,
  usableD: number
): PieceFootprint | null {
  const natural = fp.w <= usableW + 1e-9 && fp.d <= usableD + 1e-9;
  const rotated = fp.w <= usableD + 1e-9 && fp.d <= usableW + 1e-9;
  if (natural) {
    return { w: fp.w, d: fp.d };
  }
  if (rotated) {
    return { w: fp.d, d: fp.w };
  }
  return null;
}

export function footprintFitsSurface(
  piece: PieceId,
  surface: SurfaceNode
): boolean {
  const [uw, ud] = usableSize(surface);
  return orientFootprint(pieceFootprint(piece), uw, ud) !== null;
}

export function footprintArea(fp: PieceFootprint): number {
  return fp.w * fp.d;
}

/** Largest footprint among `pieces` that geometrically fits `surface`. */
export function largestFittingFootprint(
  surface: SurfaceNode,
  pieces: readonly PieceId[]
): PieceFootprint | null {
  let best: PieceFootprint | null = null;
  let bestArea = -1;
  let bestId: PieceId | null = null;
  for (const piece of PIECE_IDS) {
    if (!pieces.includes(piece)) {
      continue;
    }
    const [uw, ud] = usableSize(surface);
    const oriented = orientFootprint(pieceFootprint(piece), uw, ud);
    if (!oriented) {
      continue;
    }
    const area = footprintArea(oriented);
    if (
      area > bestArea + 1e-12 ||
      (Math.abs(area - bestArea) <= 1e-12 &&
        (bestId === null || piece.localeCompare(bestId) < 0))
    ) {
      best = oriented;
      bestArea = area;
      bestId = piece;
    }
  }
  return best;
}
