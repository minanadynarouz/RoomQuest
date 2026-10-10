/**
 * Overlay-only perf snapshot helpers for the F-05 debug panel.
 * `window.__rq` itself is owned by `rq-hooks.ts`.
 */

import type { RqPerfStats } from './stats.js';
import { EMPTY_PERF_STATS } from './stats.js';

export type { RqPerfStats } from './stats.js';
export type {
  RqHooks as RqDebugHooks,
  RqHudDebug,
  RqHookTarget,
  RqOverlayDebug,
} from './rq-hooks.js';
export {
  installRqHooks,
  registerRqHook,
  resetRqHooks,
  rqHooksEnabled,
} from './rq-hooks.js';
export { shouldExposeDebugHooks } from '../flags.js';

const latestStats: RqPerfStats = { ...EMPTY_PERF_STATS };
let hasOverlaySample = false;
let overlayReady = false;

export function setOverlayReady(ready: boolean): void {
  overlayReady = ready;
  if (typeof window !== 'undefined' && window.__rq) {
    window.__rq.overlay = { ready };
  }
}

export function isOverlayReady(): boolean {
  return overlayReady;
}

export function writeLatestPerfStats(stats: RqPerfStats): void {
  latestStats.fps = stats.fps;
  latestStats.drawCalls = stats.drawCalls;
  latestStats.triangles = stats.triangles;
  latestStats.surfaces = stats.surfaces;
  latestStats.source = stats.source;
  latestStats.latencyMs = stats.latencyMs;
  latestStats.repairs = stats.repairs;
  latestStats.fallbackReason = stats.fallbackReason;
  latestStats.validationIssues = stats.validationIssues;
  latestStats.directorStatus = stats.directorStatus;
  latestStats.requestId = stats.requestId;
  latestStats.repairedBy = stats.repairedBy;
  latestStats.relaxed = stats.relaxed;
  hasOverlaySample = true;
}

export function readLatestPerfStats(): RqPerfStats {
  return latestStats;
}

export function resetLatestPerfStats(): void {
  latestStats.fps = EMPTY_PERF_STATS.fps;
  latestStats.drawCalls = EMPTY_PERF_STATS.drawCalls;
  latestStats.triangles = EMPTY_PERF_STATS.triangles;
  latestStats.surfaces = EMPTY_PERF_STATS.surfaces;
  latestStats.source = EMPTY_PERF_STATS.source;
  latestStats.latencyMs = EMPTY_PERF_STATS.latencyMs;
  latestStats.repairs = EMPTY_PERF_STATS.repairs;
  latestStats.fallbackReason = EMPTY_PERF_STATS.fallbackReason;
  latestStats.validationIssues = EMPTY_PERF_STATS.validationIssues;
  latestStats.directorStatus = EMPTY_PERF_STATS.directorStatus;
  latestStats.requestId = EMPTY_PERF_STATS.requestId;
  latestStats.repairedBy = EMPTY_PERF_STATS.repairedBy;
  latestStats.relaxed = EMPTY_PERF_STATS.relaxed;
  hasOverlaySample = false;
  overlayReady = false;
}

export function createStatsGetter(
  fallback?: () => RqPerfStats
): () => RqPerfStats {
  return () => {
    if (hasOverlaySample) return latestStats;
    return fallback ? fallback() : latestStats;
  };
}
