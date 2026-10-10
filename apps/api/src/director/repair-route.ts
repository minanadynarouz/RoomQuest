import * as levelCore from '@roomquest/level-core';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';

/**
 * Hook for 3d Developer's upcoming `repairRoute` and route `links` hints.
 *
 * Local repair order is snap → {@link tryRepairRoute} → repairPlan.
 * When `@roomquest/level-core` exports `repairRoute`, this calls it.
 * Until then it is a no-op so the director stack is ready.
 */
export interface RepairRouteResult {
  plan: LevelPlan;
  repairs?: string[];
}

export type RepairRouteFn = (
  plan: LevelPlan,
  graph: SurfaceGraph
) => RepairRouteResult;

export function lookupRepairRoute(
  mod: { repairRoute?: RepairRouteFn } = levelCore
): RepairRouteFn | undefined {
  return typeof mod.repairRoute === 'function' ? mod.repairRoute : undefined;
}

export function tryRepairRoute(
  plan: LevelPlan,
  graph: SurfaceGraph,
  lookup: () => RepairRouteFn | undefined = lookupRepairRoute
): { plan: LevelPlan; repairs: string[] } {
  const repairRoute = lookup();
  if (repairRoute === undefined) {
    return { plan, repairs: [] };
  }
  const result = repairRoute(plan, graph);
  const repairs =
    result.repairs !== undefined && result.repairs.length > 0
      ? result.repairs
      : ['repair-route'];
  return { plan: result.plan, repairs };
}
