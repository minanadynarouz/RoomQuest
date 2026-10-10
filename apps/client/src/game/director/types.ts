/**
 * Director client types - F-03
 * Pure TypeScript, no DOM, IWSDK or Three.js imports
 */

import type {
  GeneratePlanOptions,
  Issue,
  RepairResult,
  SnapResult,
  ValidationResult,
} from '@roomquest/level-core';
import type {
  ErrorCode,
  LevelPlan,
  PlanSource,
  SurfaceGraph,
  Theme,
  Tier,
} from '@roomquest/schema';
import type {
  RelaxedRule,
  RoomUnplayableReason,
} from './schema-pending.js';

/** Client budget for accepting an API plan (Architecture §6). */
export const DIRECTOR_BUDGET_MS = 8000;

/** One-time first `/levels` budget while the health pre-warm is pending. */
export { DIRECTOR_COLD_START_BUDGET_MS, HEALTH_PATH } from './health-prewarm.js';

/** POST path for level generation. */
export const LEVELS_PATH = '/api/v1/levels';

/** Matches apps/client/package.json until a shared version module exists. */
export const DEFAULT_CLIENT_VERSION = '0.1.0';

export const DEVICE_ID_STORAGE_KEY = 'roomquest:deviceId';

/**
 * Default difficulty. F-03 has no `?tier=` flag; the API and generator
 * both accept `easy` | `normal`. The client sends `normal` unless the
 * caller injects a tier.
 */
export const DEFAULT_TIER: Tier = 'normal';

export type DirectorMode = 'live' | 'mock' | 'off';

export type FallbackReason =
  | 'timeout'
  | 'cold-start-timeout'
  | 'network'
  | 'invalid-plan'
  | 'graph-mismatch'
  | 'repaired'
  | 'api-error'
  | 'http-error'
  | 'rate-limited'
  | 'director-off'
  | 'director-mock'
  | RoomUnplayableReason;

export interface DirectorFlags {
  director: DirectorMode;
  seed?: string;
  date?: string;
}

export interface KvStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type GenerateFn = (
  graph: SurfaceGraph,
  seed: string,
  tier: Tier,
  options?: GeneratePlanOptions
) => LevelPlan | Promise<LevelPlan>;

export type ValidateResult = ValidationResult;

export type ValidateFn = (
  plan: LevelPlan,
  graph: SurfaceGraph
) => ValidationResult | Promise<ValidationResult>;

export type RepairFn = (
  plan: LevelPlan,
  graph: SurfaceGraph
) => RepairResult | Promise<RepairResult>;

export type SnapFn = (
  plan: LevelPlan,
  graph: SurfaceGraph
) => SnapResult | Promise<SnapResult>;

export type RepairedBy = 'snap' | 'repairPlan';

export type { RelaxedRule, RoomUnplayableReason } from './schema-pending.js';

/**
 * Narrow fetch contract so tests can mock without a full Request polyfill.
 */
export interface FetchHeadersLike {
  get(name: string): string | null;
}

export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  }
) => Promise<
  Pick<Response, 'ok' | 'status' | 'json'> & {
    headers?: FetchHeadersLike;
  }
>;

export interface DirectorRequestEndInfo {
  status: 'resolved' | 'fallback';
  source: 'llm' | 'procedural';
  fallbackReason?: FallbackReason;
  requestId?: string;
  repairedBy?: RepairedBy;
  relaxed?: RelaxedRule[];
}

export interface DirectorClientOptions {
  fetch: FetchLike;
  apiBaseUrl: string;
  deviceId: string;
  clientVersion?: string;
  generate?: GenerateFn;
  validate?: ValidateFn;
  repair?: RepairFn;
  snap?: SnapFn;
  /**
   * Use the synthetic fixture plan when snap + repair still fail.
   * Production keeps this off except `?fixture=`. Dev may enable it.
   */
  allowFixtureFallback?: boolean;
  directorMode?: DirectorMode;
  date?: string;
  seed?: string;
  tier?: Tier;
  recentThemes?: Theme[];
  budgetMs?: number;
  /** Override for the one-time cold-start `/levels` budget (default 20 s). */
  coldStartBudgetMs?: number;
  /** True when landing fired a health GET that has not settled yet. */
  isHealthPrewarmPending?: () => boolean;
  nowMs?: () => number;
  /** Called immediately before POST /levels (including cold-start). */
  onRequestStart?: () => void;
  /** Called when a plan is chosen (API or fallback). */
  onRequestEnd?: (info: DirectorRequestEndInfo) => void;
}

export interface RequestPlanOverrides {
  directorMode?: DirectorMode;
  date?: string;
  seed?: string;
  tier?: Tier;
  recentThemes?: Theme[];
}

export interface DirectorResult {
  plan: LevelPlan;
  source: PlanSource;
  cacheKey: string;
  model?: string;
  promptVersion: string;
  latencyMs: number;
  repairs: string[];
  usedFallback: boolean;
  fallbackReason?: FallbackReason;
  /** Set when the API returned `{error:{code}}` (INVALID_REQUEST / INTERNAL / RATE_LIMITED). */
  apiErrorCode?: ErrorCode;
  /** Seconds until the director may POST again, when the API sent `retryAfterS`. */
  retryAfterS?: number;
  /** Typed `validatePlan` issues for the debug overlay. */
  issues?: Issue[];
  /** Difficulty used for this request (F-07 proc keys). */
  tier?: Tier;
  /** `X-Request-Id` when the response header is readable. */
  requestId?: string;
  /** Which local step made the played plan validate, if any. */
  repairedBy?: RepairedBy;
  /** Relaxed validation rule ids, when the plan or validator reports them. */
  relaxed?: RelaxedRule[];
}

export interface DirectorClient {
  requestPlan(
    graph: SurfaceGraph,
    overrides?: RequestPlanOverrides
  ): Promise<DirectorResult>;
}
