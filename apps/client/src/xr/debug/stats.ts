/**
 * Perf snapshot for the F-05 overlay and `window.__rq.stats()`.
 * Numbers for draws/tris come from `renderer.info.render`.
 */

import type { FallbackReason } from '../../game/director/types.js';
import type { RelaxedRule, RepairedBy } from '../../game/director/types.js';
import type { DirectorRequestStatus } from '../../game/types.js';
import type { PlanSource } from '@roomquest/schema';
import type { RollingFps } from './rolling-fps.js';

export interface RenderInfoLike {
  info?: {
    render?: {
      calls?: number;
      triangles?: number;
    };
  };
}

export interface RqPerfStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  surfaces: number;
  source: PlanSource | null;
  latencyMs: number | null;
  repairs: number;
  fallbackReason: FallbackReason | null;
  validationIssues: number;
  directorStatus: DirectorRequestStatus;
  requestId: string | null;
  repairedBy: RepairedBy | null;
  relaxed: readonly RelaxedRule[];
}

export const EMPTY_PERF_STATS: RqPerfStats = {
  fps: 0,
  drawCalls: 0,
  triangles: 0,
  surfaces: 0,
  source: null,
  latencyMs: null,
  repairs: 0,
  fallbackReason: null,
  validationIssues: 0,
  directorStatus: 'idle',
  requestId: null,
  repairedBy: null,
  relaxed: [],
};

export function readRendererInfo(
  renderer: RenderInfoLike | null | undefined
): { calls: number; triangles: number } {
  const render = renderer?.info?.render;
  return {
    calls: render?.calls ?? 0,
    triangles: render?.triangles ?? 0,
  };
}

export interface PerfStatsInput {
  nowMs: number;
  fps: RollingFps | number;
  renderer: RenderInfoLike | null | undefined;
  surfaceCount: number;
  source: PlanSource | null;
  latencyMs: number | null;
  repairs: readonly string[];
  fallbackReason: FallbackReason | null;
  validationIssues: number;
  directorStatus?: DirectorRequestStatus;
  requestId?: string | null;
  repairedBy?: RepairedBy | null;
  relaxed?: readonly RelaxedRule[];
}

export function collectPerfStats(input: PerfStatsInput): RqPerfStats {
  const render = readRendererInfo(input.renderer);
  const fps =
    typeof input.fps === 'number' ? input.fps : input.fps.fps(input.nowMs);
  return {
    fps,
    drawCalls: render.calls,
    triangles: render.triangles,
    surfaces: input.surfaceCount,
    source: input.source,
    latencyMs: input.latencyMs,
    repairs: input.repairs.length,
    fallbackReason: input.fallbackReason,
    validationIssues: input.validationIssues,
    directorStatus: input.directorStatus ?? 'idle',
    requestId: input.requestId ?? null,
    repairedBy: input.repairedBy ?? null,
    relaxed: input.relaxed ?? [],
  };
}

export function copyPerfStats(from: RqPerfStats, into: RqPerfStats): void {
  into.fps = from.fps;
  into.drawCalls = from.drawCalls;
  into.triangles = from.triangles;
  into.surfaces = from.surfaces;
  into.source = from.source;
  into.latencyMs = from.latencyMs;
  into.repairs = from.repairs;
  into.fallbackReason = from.fallbackReason;
  into.validationIssues = from.validationIssues;
  into.directorStatus = from.directorStatus;
  into.requestId = from.requestId;
  into.repairedBy = from.repairedBy;
  into.relaxed = from.relaxed;
}

export function perfSignature(stats: RqPerfStats): string {
  return [
    Math.round(stats.fps),
    stats.drawCalls,
    stats.triangles,
    stats.surfaces,
    stats.source ?? '',
    stats.latencyMs ?? '',
    stats.repairs,
    stats.fallbackReason ?? '',
    stats.validationIssues,
    stats.directorStatus,
    stats.requestId ?? '',
    stats.repairedBy ?? '',
    stats.relaxed.join(','),
  ].join('|');
}
