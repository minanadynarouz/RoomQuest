/**
 * Apply a director result onto the F-02 game store.
 * Caller must already be in `surveying` (or another phase that can enter
 * `building`).
 */

import type { GameStore } from '../store.js';
import type { DirectorResult } from './types.js';

export function applyDirectorResult(
  store: GameStore,
  result: DirectorResult
): void {
  store.startBuilding(result.plan, {
    source: result.source,
    latencyMs: result.latencyMs,
    repairs: result.repairs,
    cacheKey: result.cacheKey,
    fallbackReason: result.fallbackReason,
    apiErrorCode: result.apiErrorCode,
    issues: result.issues,
  });
}
