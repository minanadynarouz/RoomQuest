import {
  orderRelaxedRules,
  RelaxedRule,
  type RelaxedRule as RelaxedRuleId,
} from '@roomquest/schema';

export interface LevelCacheMetadata {
  relaxed: RelaxedRuleId[];
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
  relaxed: readonly RelaxedRuleId[]
): LevelCacheMetadata {
  return { relaxed: orderRelaxedRules([...relaxed]) };
}

export function relaxedFromCacheMetadata(metadata: unknown): RelaxedRuleId[] {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return [];
  }
  return parseRelaxedRules((metadata as { relaxed?: unknown }).relaxed);
}
