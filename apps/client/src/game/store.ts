/**
 * Game store - F-02
 * State management using @preact/signals-core
 * Pure TypeScript, no DOM, IWSDK or Three.js imports
 */

import { signal, computed } from '@preact/signals-core';
import type { ErrorCode, LevelPlan, PlanSource } from '@roomquest/schema';
import type { FallbackReason } from './director/types.js';
import type {
  GamePhase,
  GameEvent,
  Clock,
  TimerState,
  BeatTiming,
  GameState,
  GameResult,
  StuckPlayerSignal,
  StartBuildingOptions,
} from './types.js';
import { defaultClock } from './types.js';
import { calculateStars } from './stars.js';

/**
 * Transition error for invalid state transitions
 */
export class TransitionError extends Error {
  constructor(
    public from: GamePhase,
    public to: GamePhase,
    message?: string
  ) {
    super(message || `Invalid transition from ${from} to ${to}`);
    this.name = 'TransitionError';
  }
}

/**
 * Valid phase transitions
 */
const VALID_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  landing: ['requesting', 'error'],
  requesting: ['surveying', 'noSurfaces', 'error'],
  surveying: ['building', 'noSurfaces', 'error'],
  building: ['playing', 'error', 'landing'],
  playing: ['paused', 'won', 'error', 'landing'],
  paused: ['playing', 'building', 'landing', 'error'],
  won: ['building', 'landing'],
  noSurfaces: ['surveying', 'landing'],
  error: ['landing'],
};

/**
 * Game store options
 */
export interface GameStoreOptions {
  clock?: Clock;
  onInvalidTransition?: 'warn' | 'error';
}

/**
 * Create a game store
 */
export function createGameStore(options: GameStoreOptions = {}) {
  const clock = options.clock || defaultClock;
  const onInvalidTransition = options.onInvalidTransition || 'warn';

  // Core signals
  const phase = signal<GamePhase>('landing');
  const plan = signal<LevelPlan | null>(null);
  const parTimeMs = signal<number>(0);
  const events = signal<GameEvent[]>([]);
  const timerState = signal<TimerState>({
    startTime: 0,
    pausedTime: 0,
    elapsedMs: 0,
    isPaused: false,
  });
  const beatTimings = signal<BeatTiming[]>([]);
  const currentBeatIndex = signal<number>(0);
  const gemsCollected = signal<number>(0);
  const error = signal<string | null>(null);
  const planSource = signal<PlanSource | null>(null);
  const directorLatencyMs = signal<number | null>(null);
  const repairs = signal<string[]>([]);
  const cacheKey = signal<string | null>(null);
  const fallbackReason = signal<FallbackReason | null>(null);
  const apiErrorCode = signal<ErrorCode | null>(null);

  // Computed values
  const state = computed<GameState>(() => ({
    phase: phase.value,
    plan: plan.value,
    events: events.value,
    timer: timerState.value,
    beatTimings: beatTimings.value,
    currentBeatIndex: currentBeatIndex.value,
    gemsCollected: gemsCollected.value,
    error: error.value,
    planSource: planSource.value,
    directorLatencyMs: directorLatencyMs.value,
    repairs: repairs.value,
    cacheKey: cacheKey.value,
    fallbackReason: fallbackReason.value,
    apiErrorCode: apiErrorCode.value,
  }));

  // Helper to get current elapsed time (not a computed to avoid caching issues)
  function getElapsedMs(): number {
    const timer = timerState.value;
    if (timer.isPaused) {
      return timer.elapsedMs;
    }
    if (timer.startTime === 0) {
      return 0;
    }
    return timer.elapsedMs + (clock.now() - timer.startTime);
  }

  const result = computed<GameResult | null>(() => {
    const currentPlan = plan.value;
    const currentParTimeMs = parTimeMs.value;
    if (!currentPlan || currentParTimeMs === 0) return null;

    const stars = calculateStars(
      getElapsedMs(),
      currentParTimeMs,
      gemsCollected.value
    );

    return {
      stars,
      gems: gemsCollected.value,
      timeMs: getElapsedMs(),
      completed: phase.value === 'won',
    };
  });

  const stuckPlayerSignal = computed<StuckPlayerSignal | null>(() => {
    const beatIndex = currentBeatIndex.value;
    const timings = beatTimings.value;
    const currentBeat = timings.find((bt) => bt.beatIndex === beatIndex);

    // Return null if no beat is found or if the beat is already completed
    if (!currentBeat) {
      return null;
    }
    if (currentBeat.durationMs !== null) {
      return null;
    }

    const timeOnBeatMs = clock.now() - currentBeat.startTime;

    // Get recent blocked events for this beat
    const recentBlocks = events.value
      .filter(
        (e) =>
          e.type === 'explorerBlocked' &&
          e.beatIndex === beatIndex &&
          e.timestamp > currentBeat.startTime
      )
      .map((e) => ({
        reason: (e as Extract<GameEvent, { type: 'explorerBlocked' }>).reason,
        timestamp: e.timestamp,
      }));

    return {
      beatIndex,
      timeOnBeatMs,
      recentBlocks,
    };
  });

  // Transition validation
  function isValidTransition(from: GamePhase, to: GamePhase): boolean {
    return VALID_TRANSITIONS[from].includes(to);
  }

  function transition(to: GamePhase) {
    const from = phase.value;

    if (!isValidTransition(from, to)) {
      const message = `Invalid transition from ${from} to ${to}`;

      if (onInvalidTransition === 'error') {
        throw new TransitionError(from, to, message);
      } else {
        console.warn(`[GameStore] ${message}`);
        return;
      }
    }

    phase.value = to;
  }

  // Timer management
  function startTimer() {
    const now = clock.now();
    timerState.value = {
      startTime: now,
      pausedTime: 0,
      elapsedMs: 0,
      isPaused: false,
    };
  }

  function pauseTimer() {
    if (timerState.value.isPaused) return;

    const now = clock.now();
    const elapsed =
      timerState.value.elapsedMs + (now - timerState.value.startTime);

    timerState.value = {
      ...timerState.value,
      pausedTime: now,
      elapsedMs: elapsed,
      isPaused: true,
    };
  }

  function resumeTimer() {
    if (!timerState.value.isPaused) return;

    const now = clock.now();

    timerState.value = {
      ...timerState.value,
      startTime: now,
      isPaused: false,
    };
  }

  function resetTimer() {
    timerState.value = {
      startTime: 0,
      pausedTime: 0,
      elapsedMs: 0,
      isPaused: false,
    };
  }

  // Beat tracking
  function startBeat(beatIndex: number) {
    const now = clock.now();
    beatTimings.value = [
      ...beatTimings.value,
      {
        beatIndex,
        startTime: now,
        durationMs: null,
      },
    ];
    currentBeatIndex.value = beatIndex;
  }

  function completeBeat(beatIndex: number) {
    const now = clock.now();
    const timings = beatTimings.value;
    const beatTiming = timings.find((bt) => bt.beatIndex === beatIndex);

    if (!beatTiming) {
      console.warn(`[GameStore] Cannot complete beat ${beatIndex}: not found`);
      return;
    }
    if (beatTiming.durationMs !== null) {
      console.warn(
        `[GameStore] Cannot complete beat ${beatIndex}: already completed`
      );
      return;
    }

    const durationMs = now - beatTiming.startTime;

    beatTimings.value = timings.map((bt) =>
      bt.beatIndex === beatIndex ? { ...bt, durationMs } : bt
    );

    emitEvent({
      type: 'beatCompleted',
      beatIndex,
      durationMs,
      timestamp: now,
    });
  }

  // Event emission helpers
  type EmittableEvent =
    | { type: 'pieceBuilt'; placementId: string }
    | { type: 'gateOpened'; placementId: string }
    | { type: 'slimeStunned'; placementId: string }
    | { type: 'gemCollected'; placementId: string }
    | {
        type: 'explorerBlocked';
        reason: 'unbuiltGap' | 'closedGate' | 'awakeSlime';
      }
    | { type: 'explorerOutOfView' }
    | { type: 'won' }
    | {
        type: 'beatCompleted';
        beatIndex: number;
        durationMs: number;
        timestamp: number;
      };

  function emitEvent(event: EmittableEvent) {
    const now = clock.now();

    // beatCompleted already has all fields
    if (event.type === 'beatCompleted') {
      events.value = [...events.value, event];
      return;
    }

    const fullEvent: GameEvent = {
      ...event,
      timestamp: now,
      beatIndex: currentBeatIndex.value,
    };

    events.value = [...events.value, fullEvent];

    // Update gems counter for gem collection events
    if (event.type === 'gemCollected') {
      gemsCollected.value += 1;
    }
  }

  // Public API
  return {
    // Signals (read-only access via .value)
    get phase() {
      return phase.value;
    },
    get plan() {
      return plan.value;
    },
    get events() {
      return events.value;
    },
    get state() {
      return state.value;
    },
    get elapsedMs() {
      return getElapsedMs();
    },
    get result() {
      return result.value;
    },
    get stuckPlayerSignal() {
      return stuckPlayerSignal.value;
    },
    get planSource() {
      return planSource.value;
    },
    get directorLatencyMs() {
      return directorLatencyMs.value;
    },
    get repairs() {
      return repairs.value;
    },
    get cacheKey() {
      return cacheKey.value;
    },
    get fallbackReason() {
      return fallbackReason.value;
    },
    get apiErrorCode() {
      return apiErrorCode.value;
    },

    // Phase transitions
    requestLevel() {
      transition('requesting');
    },

    startSurveying() {
      transition('surveying');
    },

    noSurfaces() {
      transition('noSurfaces');
    },

    startBuilding(levelPlan: LevelPlan, options?: StartBuildingOptions) {
      plan.value = levelPlan;
      parTimeMs.value = options?.parTimeMs ?? levelPlan.parTimeMs;
      planSource.value = options?.source ?? null;
      directorLatencyMs.value = options?.latencyMs ?? null;
      repairs.value = options?.repairs ?? [];
      cacheKey.value = options?.cacheKey ?? null;
      fallbackReason.value = options?.fallbackReason ?? null;
      apiErrorCode.value = options?.apiErrorCode ?? null;
      events.value = [];
      gemsCollected.value = 0;
      beatTimings.value = [];
      currentBeatIndex.value = 0;
      resetTimer();
      transition('building');
    },

    startPlaying() {
      startTimer();
      startBeat(0);
      transition('playing');
    },

    pause() {
      pauseTimer();
      transition('paused');
    },

    resume() {
      resumeTimer();
      transition('playing');
    },

    win() {
      pauseTimer();
      emitEvent({ type: 'won' });
      transition('won');
    },

    error(message: string) {
      error.value = message;
      transition('error');
    },

    replay() {
      if (phase.value !== 'won' && phase.value !== 'paused') {
        console.warn(
          '[GameStore] Replay only available from won or paused state'
        );
        return;
      }

      const currentPlan = plan.value;
      const currentParTimeMs = parTimeMs.value;
      if (!currentPlan) {
        console.warn('[GameStore] Cannot replay: no plan available');
        return;
      }

      // Replay resets to building with the same plan and par time
      transition('building');
      events.value = [];
      gemsCollected.value = 0;
      beatTimings.value = [];
      currentBeatIndex.value = 0;
      resetTimer();
      // Keep the same par time
      parTimeMs.value = currentParTimeMs;
    },

    exit() {
      // Exit returns to landing
      plan.value = null;
      parTimeMs.value = 0;
      planSource.value = null;
      directorLatencyMs.value = null;
      repairs.value = [];
      cacheKey.value = null;
      fallbackReason.value = null;
      apiErrorCode.value = null;
      events.value = [];
      gemsCollected.value = 0;
      beatTimings.value = [];
      currentBeatIndex.value = 0;
      error.value = null;
      resetTimer();
      transition('landing');
    },

    // Event emission
    pieceBuilt(placementId: string) {
      emitEvent({ type: 'pieceBuilt' as const, placementId });
    },

    gateOpened(placementId: string) {
      emitEvent({ type: 'gateOpened' as const, placementId });
    },

    slimeStunned(placementId: string) {
      emitEvent({ type: 'slimeStunned' as const, placementId });
    },

    gemCollected(placementId: string) {
      emitEvent({ type: 'gemCollected' as const, placementId });
    },

    explorerBlocked(reason: 'unbuiltGap' | 'closedGate' | 'awakeSlime') {
      emitEvent({ type: 'explorerBlocked' as const, reason });
    },

    explorerOutOfView() {
      emitEvent({ type: 'explorerOutOfView' as const });
    },

    // Beat management
    advanceBeat() {
      const currentPlan = plan.value;
      if (!currentPlan) return;

      const nextBeatIndex = currentBeatIndex.value + 1;
      if (nextBeatIndex >= currentPlan.beats.length) {
        console.warn('[GameStore] No more beats to advance to');
        return;
      }

      // Complete current beat
      completeBeat(currentBeatIndex.value);

      // Start next beat
      startBeat(nextBeatIndex);
    },
  };
}

export type GameStore = ReturnType<typeof createGameStore>;
