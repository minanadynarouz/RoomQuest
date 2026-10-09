/**
 * Game store types - F-02
 * Pure TypeScript, no DOM, IWSDK or Three.js imports
 */

import type { Issue } from '@roomquest/level-core';
import type { ErrorCode, LevelPlan, PlanSource } from '@roomquest/schema';
import type { FallbackReason } from './director/types.js';

/**
 * Options for startBuilding, including F-03 director metadata.
 */
export interface StartBuildingOptions {
  parTimeMs?: number;
  source?: PlanSource;
  latencyMs?: number;
  repairs?: string[];
  cacheKey?: string;
  fallbackReason?: FallbackReason;
  apiErrorCode?: ErrorCode;
  /** Seconds until the director may POST again after a 429. */
  retryAfterS?: number;
  issues?: Issue[];
}

/**
 * Game phase state machine
 * landing → requesting → surveying → building → playing ⇄ paused → won | noSurfaces | error
 */
export type GamePhase =
  | 'landing'
  | 'requesting'
  | 'surveying'
  | 'building'
  | 'playing'
  | 'paused'
  | 'won'
  | 'noSurfaces'
  | 'error';

/**
 * Typed game events with timestamps and beat tracking
 */
export type GameEvent =
  | {
      type: 'pieceBuilt';
      placementId: string;
      timestamp: number;
      beatIndex: number;
    }
  | {
      type: 'gateOpened';
      placementId: string;
      timestamp: number;
      beatIndex: number;
    }
  | {
      type: 'slimeStunned';
      placementId: string;
      timestamp: number;
      beatIndex: number;
    }
  | {
      type: 'gemCollected';
      placementId: string;
      timestamp: number;
      beatIndex: number;
    }
  | {
      type: 'explorerBlocked';
      reason: 'unbuiltGap' | 'closedGate' | 'awakeSlime';
      timestamp: number;
      beatIndex: number;
    }
  | { type: 'explorerOutOfView'; timestamp: number; beatIndex: number }
  | {
      type: 'beatCompleted';
      beatIndex: number;
      durationMs: number;
      timestamp: number;
    }
  | { type: 'won'; timestamp: number; beatIndex: number };

/**
 * Clock interface for injected time
 * Allows deterministic testing
 */
export interface Clock {
  now(): number;
}

/**
 * Default clock using performance.now()
 */
export const defaultClock: Clock = {
  now: () => performance.now(),
};

/**
 * Timer state
 */
export interface TimerState {
  startTime: number;
  pausedTime: number;
  elapsedMs: number;
  isPaused: boolean;
}

/**
 * Per-beat timing tracking
 */
export interface BeatTiming {
  beatIndex: number;
  startTime: number;
  durationMs: number | null;
}

/**
 * Read-only stuck-player signal selector
 */
export interface StuckPlayerSignal {
  beatIndex: number;
  timeOnBeatMs: number;
  recentBlocks: {
    reason: 'unbuiltGap' | 'closedGate' | 'awakeSlime';
    timestamp: number;
  }[];
}

/**
 * Game session result
 */
export interface GameResult {
  stars: 1 | 2 | 3;
  gems: number;
  timeMs: number;
  completed: boolean;
}

/**
 * Full game state
 */
export interface GameState {
  phase: GamePhase;
  plan: LevelPlan | null;
  events: GameEvent[];
  timer: TimerState;
  beatTimings: BeatTiming[];
  currentBeatIndex: number;
  gemsCollected: number;
  error: string | null;
  /** How the current plan was obtained (F-03 director client). */
  planSource: PlanSource | null;
  /** Director request latency in milliseconds. */
  directorLatencyMs: number | null;
  /** Validator repairs reported by the API. */
  repairs: string[];
  /** Cache key from the director response, if any. */
  cacheKey: string | null;
  /** Why the director fell back to the local generator, if it did. */
  fallbackReason: FallbackReason | null;
  /** API `{error.code}` (`INVALID_REQUEST` / `INTERNAL` / `RATE_LIMITED`) when the envelope parsed. */
  apiErrorCode: ErrorCode | null;
  /** Seconds until the director may POST again after a 429, if the API sent it. */
  retryAfterS: number | null;
  /** Typed `validatePlan` issues for the debug overlay. */
  validationIssues: Issue[];
}
