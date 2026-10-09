/**
 * `window.__rq` debug hooks (F-05).
 * Installed only in Vite dev or when `?debug=1` is set.
 * `autoSolve` is a typed slot for F-09; this ticket does not fill it in.
 */

import type { GameStore } from '../../game/index.js';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import type { HudPanelId } from '../../ui/visibility.js';
import type { SnapTarget } from '../level/types.js';
import type { PlacementDebugApi } from '../systems/PlacementSystem.js';
import {
  shouldExposeDebugHooks,
  type ClientFlags,
} from '../flags.js';
import type { RqPerfStats } from './stats.js';
import { EMPTY_PERF_STATS } from './stats.js';

export type { RqPerfStats } from './stats.js';
export { shouldExposeDebugHooks } from '../flags.js';

export interface RqHudDebug {
  ready: boolean;
  visible: readonly HudPanelId[];
}

export interface RqOverlayDebug {
  ready: boolean;
}

export interface RqDebugHooks {
  store: GameStore;
  graph: SurfaceGraph | null;
  plan: LevelPlan | null;
  snapTargets: readonly SnapTarget[];
  drawCalls: number;
  hud?: RqHudDebug;
  overlay?: RqOverlayDebug;
  placement: PlacementDebugApi | null;
  stats: () => RqPerfStats;
  /** Filled in by F-09 / X-05 via registerRqHook. */
  autoSolve?: () => Promise<void>;
}

export interface RqHookTarget {
  __rq?: RqDebugHooks;
}

declare global {
  interface Window {
    __rq?: RqDebugHooks;
  }
}

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

/**
 * Install or strip `target.__rq` based on the shared flag + dev gate.
 * Returns whether hooks are live.
 */
export function applyRqHooks(
  flags: Pick<ClientFlags, 'debug'>,
  isDev: boolean,
  target: RqHookTarget,
  factory: () => RqDebugHooks
): boolean {
  const enabled = shouldExposeDebugHooks(flags, isDev);
  if (!enabled) {
    if (target.__rq) delete target.__rq;
    return false;
  }
  const next = factory();
  const previous = target.__rq;
  target.__rq = {
    ...next,
    hud: next.hud ?? previous?.hud,
    overlay:
      next.overlay ??
      (overlayReady ? { ready: true } : previous?.overlay),
    placement: next.placement ?? previous?.placement ?? null,
    autoSolve: next.autoSolve ?? previous?.autoSolve,
  };
  return true;
}
