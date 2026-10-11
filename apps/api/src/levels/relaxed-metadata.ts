import {
  orderRelaxedRules,
  RelaxedRule,
  type RelaxedRule as RelaxedRuleId,
} from '@roomquest/schema';

export interface LevelCacheMetadata {
  relaxed: RelaxedRuleId[];
  /** Route-arm levels only: the chosen candidate route id. */
  routeId?: string;
}

export function parseRelaxedRules(value: unknown): RelaxedRuleId[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: RelaxedRuleId[] = [];
  for (const item of value) {
    const result = RelaxedRule.safeParse(item);
    if (result.success) {
      parsed.push(result.data);
    }
  }
  return orderRelaxedRules(parsed);
}

export function cacheMetadataFromRelaxed(
  relaxed: readonly RelaxedRuleId[],
  routeId?: string
): LevelCacheMetadata {
  return {
    relaxed: orderRelaxedRules([...relaxed]),
    ...(routeId === undefined || routeId.length === 0 ? {} : { routeId }),
  };
}

/** Stored route id of a route-arm level; undefined for every other row. */
export function routeIdFromCacheMetadata(metadata: unknown): string | undefined {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return undefined;
  }
  const routeId = (metadata as { routeId?: unknown }).routeId;
  return typeof routeId === 'string' && routeId.length > 0 ? routeId : undefined;
}

export function relaxedFromCacheMetadata(metadata: unknown): RelaxedRuleId[] {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return [];
  }
  return parseRelaxedRules((metadata as { relaxed?: unknown }).relaxed);
}
