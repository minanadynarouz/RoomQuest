import {
  orderRelaxedRules,
  type RelaxedRule,
  type SurfaceGraph,
} from '@roomquest/schema';
import {
  graphCanSeparateHutAndShrine,
  graphHasCatalogHut,
  graphHasPlayableView,
} from './graph-capacity';

/**
 * Map #60's graph-capacity waiver helpers onto {@link RelaxedRule} ids.
 *
 * A rule is listed when the corresponding helper is already skipping that
 * check. Order is always minPath, hutTable, portalFov.
 */
export function relaxedRulesFor(graph: SurfaceGraph): RelaxedRule[] {
  const rules: RelaxedRule[] = [];
  if (!graphCanSeparateHutAndShrine(graph)) {
    rules.push('minPath');
  }
  if (!graphHasCatalogHut(graph)) {
    rules.push('hutTable');
  }
  if (!graphHasPlayableView(graph)) {
    rules.push('portalFov');
  }
  return orderRelaxedRules(rules);
}
