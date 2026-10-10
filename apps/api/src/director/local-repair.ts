import {
  repairPlan,
  snapPlacementsToSlots,
  validatePlan,
  type RepairResult,
} from '@roomquest/level-core';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import { tryRepairRoute } from './repair-route';

/**
 * Apply `snapPlacementsToSlots` from `@roomquest/level-core` (#61).
 * Returns the snapped plan; unchanged when there are no slot moves.
 */
export function trySnapPlacementsToSlots(
  plan: LevelPlan,
  graph: SurfaceGraph
): LevelPlan {
  return snapPlacementsToSlots(plan, graph).plan;
}

/**
 * Local deterministic repair: snap, then `repairRoute` (when present),
 * then `repairPlan`. Route `links` hints are reserved for repairRoute.
 */
export function localRepairPlan(
  plan: LevelPlan,
  graph: SurfaceGraph
): RepairResult {
  const snapped = snapPlacementsToSlots(plan, graph);
  const routed = tryRepairRoute(snapped.plan, graph);
  const repaired = repairPlan(routed.plan, graph);
  const extra: string[] = [];
  if (snapped.changes.length > 0) {
    extra.push('snap-to-slots');
  }
  extra.push(...routed.repairs);
  const repairs = [...extra, ...repaired.repairs].filter(
    (item, index, all) => all.indexOf(item) === index
  );
  if (extra.length === 0) {
    return repaired;
  }
  return {
    plan: repaired.plan,
    repairs,
    result: validatePlan(repaired.plan, graph),
  };
}
