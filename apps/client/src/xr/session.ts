/**
 * F-07 session controller: win/pause HUD actions, explorer freeze,
 * result posting, replay rebuild.
 *
 * No IWSDK imports — world/builder/explorer are injected.
 */

import type { LevelPlan, PlanSource, SurfaceGraph, Tier } from '@roomquest/schema';
import {
  DEFAULT_TIER,
  calculateStars,
  resolveLevelKey,
  type GameStore,
  type PostLevelResultInput,
} from '../game/index.js';
import { playUiSound } from '../audio/index.js';
import type { HudActions } from '../ui/hud-actions.js';
import { isXrHiddenOrBlurred } from './visibility-pause.js';

export interface SessionExplorer {
  pause: () => void;
  resume: () => void;
  begin: (plan: LevelPlan, graph: SurfaceGraph) => void;
}

export interface SessionBuilder {
  build: (plan: LevelPlan, graph: SurfaceGraph) => void;
}

export interface SessionWorld {
  exitXR: () => void;
}

export interface SessionDeps {
  store: GameStore;
  getWorld: () => SessionWorld | null;
  getBuilder: () => SessionBuilder | null;
  getExplorer: () => SessionExplorer | null;
  getGraph: () => SurfaceGraph | null;
  postResult: (input: PostLevelResultInput) => void;
  deviceId: string;
  showLanding: () => void;
  rescanRoom?: () => void;
}

export interface SessionController extends HudActions {
  forceWin: () => void;
  onVisibilityState: (state: unknown) => void;
  dispose: () => void;
}

function snapshotPost(store: GameStore, deviceId: string, completed: boolean): {
  levelKey: string;
  body: Omit<PostLevelResultInput, 'levelKey'>;
} | null {
  const plan = store.plan;
  const source: PlanSource = store.planSource ?? 'procedural';
  const seed = plan?.seed;
  const tier: Tier = store.tier ?? DEFAULT_TIER;
  const levelKey = resolveLevelKey({
    planSource: store.planSource,
    cacheKey: store.cacheKey,
    seed,
    tier,
  });
  if (!levelKey) return null;
  const result = store.result;
  const gems = result?.gems ?? store.state.gemsCollected;
  const timeMs = result?.timeMs ?? store.elapsedMs;
  // `win()` emits `won` before the phase becomes `won`, so `store.result.stars`
  // is still 0 (calculateStars treats incomplete runs as 0). Score from the
  // completed flag we are about to post instead.
  const stars = completed
    ? calculateStars({
        plan,
        gemsCollected: gems,
        elapsedMs: timeMs,
        completed: true,
      })
    : 0;
  return {
    levelKey,
    body: {
      deviceId,
      stars,
      gems,
      timeMs,
      completed,
      planSource: source,
    },
  };
}

export function createSessionController(deps: SessionDeps): SessionController {
  const { store } = deps;
  let posted = false;
  let unsubEvents: (() => void) | null = null;

  function fire(completed: boolean): void {
    if (posted) return;
    const snap = snapshotPost(store, deps.deviceId, completed);
    if (!snap) return;
    posted = true;
    deps.postResult({ levelKey: snap.levelKey, ...snap.body });
  }

  unsubEvents = store.subscribeEvents((event) => {
    if (event.type === 'won') {
      fire(true);
    }
  });

  function pause(): void {
    if (store.phase !== 'playing') return;
    store.pause();
    deps.getExplorer()?.pause();
    playUiSound('pause');
  }

  function resume(): void {
    if (store.phase !== 'paused') return;
    store.resume();
    deps.getExplorer()?.resume();
    playUiSound('resume');
  }

  function replay(): void {
    const plan = store.plan;
    if (!plan) return;
    const graph = deps.getGraph();
    store.replay();
    posted = false;
    playUiSound('replay');
    if (graph) {
      deps.getBuilder()?.build(plan, graph);
      const explorer = deps.getExplorer();
      explorer?.resume();
      explorer?.begin(plan, graph);
    }
    if (store.phase === 'building') {
      store.startPlaying();
    }
  }

  function rescan(): void {
    if (store.phase === 'roomUnplayable' || store.phase === 'noSurfaces') {
      store.startSurveying();
    }
    deps.rescanRoom?.();
  }

  function exit(): void {
    if (store.phase === 'playing' || store.phase === 'paused') {
      fire(false);
    }
    store.exit();
    deps.getWorld()?.exitXR();
    deps.showLanding();
    playUiSound('exit');
  }

  function forceWin(): void {
    if (store.phase === 'paused') {
      resume();
    }
    if (store.phase === 'playing') {
      store.win();
    }
  }

  function onVisibilityState(state: unknown): void {
    if (isXrHiddenOrBlurred(state)) {
      pause();
    }
  }

  return {
    pause,
    resume,
    replay,
    exit,
    rescan,
    forceWin,
    onVisibilityState,
    dispose: () => {
      unsubEvents?.();
      unsubEvents = null;
    },
  };
}
