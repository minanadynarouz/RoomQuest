import {
  graphCanSeparateHutAndShrine,
  graphHasCatalogHut,
  graphHasPlayableView,
} from '@roomquest/level-core';
import type { SurfaceGraph } from '@roomquest/schema';

/** Posted when the graph has no pair ≥ 0.8 m (PATH_DISTANCE_TOO_SHORT waived). */
export const PATH_DISTANCE_WAIVER =
  'No two surfaces are 0.8 m apart in this room; ignore the minimum path length.';

/** Posted when no table/desk meets village_hut height and view constraints. */
export const HUT_TABLE_WAIVER =
  'No table is in the required height and view range; place the hut on the best available table or desk, else the largest surface.';

/** Posted when no hand/ray surface sits in the 50° forward cone. */
export const PORTAL_FOV_WAIVER =
  'No surface is in the forward view; portal view-angle rules do not apply.';

/**
 * Which of #60's validation waivers apply to this graph. Empty when the
 * room can satisfy every catalog constraint (IWER `office_small`).
 */
export function graphWaiverLines(graph: SurfaceGraph): string[] {
  const lines: string[] = [];
  if (!graphCanSeparateHutAndShrine(graph)) {
    lines.push(PATH_DISTANCE_WAIVER);
  }
  if (!graphHasCatalogHut(graph)) {
    lines.push(HUT_TABLE_WAIVER);
  }
  if (!graphHasPlayableView(graph)) {
    lines.push(PORTAL_FOV_WAIVER);
  }
  return lines;
}
