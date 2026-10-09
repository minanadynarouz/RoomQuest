/**
 * Director client types - F-03
 * Pure TypeScript, no DOM, IWSDK or Three.js imports
 */

import type { Issue, ValidationResult } from '@roomquest/level-core';
import type {
  ErrorCode,
  LevelPlan,
  PlanSource,
  SurfaceGraph,
  Theme,
  Tier,
} from '@roomquest/schema';

/** Client budget for accepting an API plan (Architecture §6). */
export const DIRECTOR_BUDGET_MS = 8000;

/** POST path for level generation. */
export const LEVELS_PATH = '/api/v1/levels';

/** Matches apps/client/package.json until a shared version module exists. */
export const DEFAULT_CLIENT_VERSION = '0.1.0';

export const DEVICE_ID_STORAGE_KEY = 'roomquest:deviceId';

export type DirectorMode = 'live' | 'mock' | 'off';

export type FallbackReason =
  | 'timeout'
  | 'network'
  | 'invalid-plan'
  | 'graph-mismatch'
  | 'api-error'
  | 'http-error'
  | 'director-off'
  | 'director-mock';

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
  tier: Tier
) => LevelPlan | Promise<LevelPlan>;

export type ValidateResult = ValidationResult;

export type ValidateFn = (
  plan: LevelPlan,
  graph: SurfaceGraph
) => ValidationResult | Promise<ValidationResult>;

/**
 * Narrow fetch contract so tests can mock without a full Request polyfill.
 */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  }
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export interface DirectorClientOptions {
  fetch: FetchLike;
  apiBaseUrl: string;
  deviceId: string;
  clientVersion?: string;
  generate?: GenerateFn;
  validate?: ValidateFn;
  directorMode?: DirectorMode;
  date?: string;
  seed?: string;
  tier?: Tier;
  recentThemes?: Theme[];
  budgetMs?: number;
  nowMs?: () => number;
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
  /** Set when the API returned `{error:{code}}` (INVALID_REQUEST / INTERNAL). */
  apiErrorCode?: ErrorCode;
  /** Typed `validatePlan` issues for the debug overlay. */
  issues?: Issue[];
}

export interface DirectorClient {
  requestPlan(
    graph: SurfaceGraph,
    overrides?: RequestPlanOverrides
  ): Promise<DirectorResult>;
}
