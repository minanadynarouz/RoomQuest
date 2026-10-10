import {
  repairPlan,
  snapPlacementsToSlots,
  validatePlan,
  type RepairResult,
} from '@roomquest/level-core';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';

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
 * Local deterministic repair: `repairPlan`, then `snapPlacementsToSlots`,
 * then `validatePlan`.
 */
export function localRepairPlan(
  plan: LevelPlan,
  graph: SurfaceGraph
): RepairResult {
  const repaired = repairPlan(plan, graph);
  const snapped = snapPlacementsToSlots(repaired.plan, graph);
  if (snapped.changes.length === 0) {
    return repaired;
  }
  const repairs = repaired.repairs.includes('snap-to-slots')
    ? repaired.repairs
    : [...repaired.repairs, 'snap-to-slots'];
  return {
    plan: snapped.plan,
    repairs,
    result: validatePlan(snapped.plan, graph),
  };
}
