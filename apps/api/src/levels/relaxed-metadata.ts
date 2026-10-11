import { z } from 'zod';
import {
  DECORATION_MAX_LINES,
  LevelLine,
  orderRelaxedRules,
  RelaxedRule,
  type RelaxedRule as RelaxedRuleId,
} from '@roomquest/schema';

export interface LevelCacheMetadata {
  relaxed: RelaxedRuleId[];
  /** Route-arm levels only: the chosen candidate route id. */
  routeId?: string;
  /** Route-arm levels only: the served Pip lines. */
  lines?: LevelLine[];
}

const CachedLines = z.array(LevelLine).min(1).max(DECORATION_MAX_LINES);

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
  routeId?: string,
  lines?: readonly LevelLine[]
): LevelCacheMetadata {
  return {
    relaxed: orderRelaxedRules([...relaxed]),
    ...(routeId === undefined || routeId.length === 0 ? {} : { routeId }),
    ...(lines === undefined || lines.length === 0
      ? {}
      : { lines: lines.map((line) => ({ ...line })) }),
  };
}

/** Stored Pip lines, validated with the LevelResponse line schema. */
export function linesFromCacheMetadata(
  metadata: unknown
): LevelLine[] | undefined {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return undefined;
  }
  const parsed = CachedLines.safeParse((metadata as { lines?: unknown }).lines);
  return parsed.success ? parsed.data : undefined;
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
