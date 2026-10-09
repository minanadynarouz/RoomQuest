import type { LevelPlan, Placement } from '@roomquest/schema';
import {
  PORTAL_FLASH_PEAK,
  PORTAL_TELEPORT_DURATION_S,
} from './constants';
import type { PortalPair } from './types';

function isPortal(placement: Placement | undefined): placement is Placement {
  return placement?.piece === 'portal';
}

/** Portal placements in plan order (at most a pair). */
export function listPortalPlacements(plan: LevelPlan): Placement[] {
  const found: Placement[] = [];
  for (const placement of plan.placements) {
    if (placement.piece === 'portal') {
      found.push(placement);
    }
  }
  return found;
}

/**
 * The other end of a portal. Prefers `links`, then a sibling portal, then `to`.
 */
export function portalPartnerId(
  plan: LevelPlan,
  portalId: string
): string | undefined {
  const portal = plan.placements.find((p) => p.id === portalId);
  if (!isPortal(portal)) return undefined;
  for (const link of portal.links) {
    const target = plan.placements.find((p) => p.id === link);
    if (isPortal(target) && target.id !== portalId) {
      return target.id;
    }
  }
  for (const placement of plan.placements) {
    if (placement.piece === 'portal' && placement.id !== portalId) {
      return placement.id;
    }
  }
  return portal.id;
}

/** Max one pair. Returns null when the plan has no portals. */
export function findPortalPair(plan: LevelPlan): PortalPair | null {
  const portals = listPortalPlacements(plan);
  const first = portals[0];
  if (!first) return null;
  const second = portals[1];
  if (!second) {
    return { aId: first.id, bId: first.id };
  }
  return { aId: first.id, bId: second.id };
}

/**
 * Uniform scale for a simple in/out flash. `elapsedS` is injected delta-time
 * accumulation — never wall-clock.
 */
export function portalFlashScale(
  elapsedS: number,
  durationS = PORTAL_TELEPORT_DURATION_S,
  peak = PORTAL_FLASH_PEAK
): number {
  if (elapsedS <= 0 || elapsedS >= durationS) {
    return 1;
  }
  const t = elapsedS / durationS;
  const bump = t < 0.5 ? t * 2 : (1 - t) * 2;
  return 1 + (peak - 1) * bump;
}
