/**
 * XR session initialization and launch
 * X-03: LevelBuilderSystem, greybox kit, fixture / debug URL flags
 * F-04: spatial HUD panels (lazy-loaded with this XR module)
 * X-04: PlacementSystem pinch-place with snap
 * F-05: debug overlay + window.__rq (dev or ?debug=1); overlay lazy-loads
 * F-06: onboarding, gaze hint, FoV edge arrow (ExplorerTarget for X-05)
 * X-05: ExplorerSystem + registerRqHook('autoSolve')
 * X-06: GateLeverSystem (poke / ray+pinch lever, gate animation)
 * F-07: win HUD, stars, pause, silent result posting
 * F-08: audio manager + CC0 SFX (unlocked on Enter, lazy with this chunk)
 * X-09: VillageAnchorSystem persist/restore (largest-table fallback)
 */

import {
  AmbientLight,
  Color,
  DirectionalLight,
  SessionMode,
  World,
} from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import {
  bindAudioStore,
  preloadSounds,
  unlockAudio,
} from '../audio/index.js';
import {
  applyDirectorResult,
  createDirectorClientFromEnv,
  createGameStore,
  createResultPoster,
  getOrCreateDeviceId,
} from '../game/index.js';
import { bindGuidanceStore, GuidanceSystem } from '../ui/GuidanceSystem.js';
import {
  bindHudActions,
  bindHudStore,
  HudSystem,
  setExplorerAnchor,
} from '../ui/HudSystem.js';
import { createSessionController, type SessionController } from './session.js';
import { setExplorerTarget } from '../ui/explorer-target.js';
import { createStatsGetter, isOverlayReady } from './debug/hooks.js';
import { installRqHooks, registerRqHook } from './debug/rq-hooks.js';
import { collectPerfStats } from './debug/stats.js';
import { autoSolve } from './explorer/auto-solve.js';
import {
  isFixtureXrSession,
  isSyntheticLivingRoomFixture,
  readClientFlags,
  type ClientFlags,
} from './flags.js';
import { LevelBuilderSystem } from './systems/LevelBuilderSystem.js';
import { ExplorerSystem } from './systems/ExplorerSystem.js';
import { GateLeverSystem } from './systems/GateLeverSystem.js';
import {
  PlacementSystem,
  type PlacementDebugApi,
} from './systems/PlacementSystem.js';
import { SurfaceGraphSystem } from './systems/SurfaceGraphSystem.js';
import { VillageAnchorSystem } from './systems/VillageAnchorSystem.js';
import { countDrawCalls } from './level/draw-calls.js';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import type { SnapTarget } from './level/types.js';

export type { RqHooks, RqHudDebug, RqGuidanceDebug } from './debug/rq-hooks.js';
export { registerRqHook } from './debug/rq-hooks.js';
export { setExplorerAnchor };
export { setExplorerTarget };
export type { ExplorerTarget } from '../ui/explorer-target.js';

let worldInstance: World | null = null;
const gameStore = createGameStore();
bindAudioStore(gameStore);
let latestGraph: SurfaceGraph | null = null;
let latestPlan: LevelPlan | null = null;
let latestSnapTargets: readonly SnapTarget[] = [];
let latestSceneDrawCalls = 0;
let latestPlacement: PlacementDebugApi | null = null;
let clientFlags: ClientFlags = readClientFlags('');
let overlayRequested = false;
let autoSolveHookRegistered = false;
let sessionController: SessionController | null = null;
let sessionHooksRegistered = false;
let visibilityBound = false;

const statsGetter = createStatsGetter(() =>
  collectPerfStats({
    nowMs: 0,
    fps: 0,
    renderer: worldInstance?.renderer,
    surfaceCount: latestGraph?.nodes.length ?? 0,
    source: gameStore.planSource,
    latencyMs: gameStore.directorLatencyMs,
    repairs: gameStore.repairs,
    fallbackReason: gameStore.fallbackReason,
    validationIssues: gameStore.validationIssues.length,
  })
);

function showLandingPage(): void {
  const landing = document.getElementById('landing-page');
  if (landing) landing.style.display = '';
}

function ensureSessionController(): SessionController {
  if (sessionController) return sessionController;
  const storage = browserKv();
  const deviceId = getOrCreateDeviceId(storage);
  const poster = createResultPoster({
    fetch: async (input, init) => fetch(input, init),
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    deviceId,
  });
  sessionController = createSessionController({
    store: gameStore,
    getWorld: () => worldInstance,
    getBuilder: () => worldInstance?.getSystem(LevelBuilderSystem) ?? null,
    getExplorer: () => worldInstance?.getSystem(ExplorerSystem) ?? null,
    getGraph: () => latestGraph,
    postResult: (input) => {
      void poster.post(input);
    },
    deviceId,
    showLanding: showLandingPage,
  });
  bindHudActions(sessionController);
  return sessionController;
}

function registerSessionHooks(): void {
  if (sessionHooksRegistered || !sessionController) return;
  sessionHooksRegistered = true;
  const gate = { flags: clientFlags, isDev: import.meta.env.DEV };
  registerRqHook('pause', () => sessionController?.pause(), gate);
  registerRqHook('resume', () => sessionController?.resume(), gate);
  registerRqHook('forceWin', () => sessionController?.forceWin(), gate);
}

function bindVisibilityPause(world: World): void {
  if (visibilityBound) return;
  visibilityBound = true;
  const session = ensureSessionController();
  world.visibilityState.subscribe((state) => {
    session.onVisibilityState(state);
  });
  const xr = world.renderer.xr;
  const onSessionStart = (): void => {
    const xrSession = xr.getSession();
    if (!xrSession) return;
    const onVis = (): void => {
      session.onVisibilityState(xrSession.visibilityState);
    };
    xrSession.addEventListener('visibilitychange', onVis);
  };
  xr.addEventListener('sessionstart', onSessionStart);
}

function registerAutoSolveHook(): void {
  if (autoSolveHookRegistered) return;
  autoSolveHookRegistered = true;
  registerRqHook(
    'autoSolve',
    () => {
      if (!latestPlan) return Promise.resolve();
      autoSolve({
        store: gameStore,
        plan: latestPlan,
        placement: latestPlacement,
      });
      return Promise.resolve();
    },
    { flags: clientFlags, isDev: import.meta.env.DEV }
  );
}

function exposeHooks(
  graph: SurfaceGraph | null = latestGraph,
  plan: LevelPlan | null = latestPlan,
  snapTargets: readonly SnapTarget[] = latestSnapTargets,
  drawCalls = latestSceneDrawCalls,
  placement: PlacementDebugApi | null = latestPlacement
): void {
  latestGraph = graph;
  latestPlan = plan;
  latestSnapTargets = snapTargets;
  latestSceneDrawCalls = drawCalls;
  latestPlacement = placement;
  if (typeof window === 'undefined') return;
  registerAutoSolveHook();
  installRqHooks(
    {
      store: gameStore,
      graph: latestGraph,
      plan: latestPlan,
      snapTargets: latestSnapTargets,
      drawCalls: latestSceneDrawCalls,
      hud: window.__rq?.hud,
      overlay: isOverlayReady() ? { ready: true } : window.__rq?.overlay,
      placement: latestPlacement,
      stats: statsGetter,
      playSynthetic: playSyntheticLevel,
    },
    { flags: clientFlags, isDev: import.meta.env.DEV }
  );
}

function browserKv(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
} {
  const memory = new Map<string, string>();
  const fallback = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  if (typeof window === 'undefined') return fallback;
  try {
    window.localStorage.getItem('rq.storage.probe');
    return window.localStorage;
  } catch {
    return fallback;
  }
}

/** Real localStorage only. Private mode surfaces as unavailable, never a memory fake. */
function villageAnchorStorage(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
} {
  if (typeof window === 'undefined') {
    return {
      getItem() {
        throw new Error('no localStorage');
      },
      setItem() {
        throw new Error('no localStorage');
      },
    };
  }
  try {
    window.localStorage.getItem('rq.storage.probe');
    return window.localStorage;
  } catch {
    return {
      getItem() {
        throw new Error('localStorage unavailable');
      },
      setItem() {
        throw new Error('localStorage unavailable');
      },
    };
  }
}

function canBuildFromDirector(phase: string): boolean {
  return phase === 'surveying' || phase === 'requesting';
}

function playSyntheticLevel(): boolean {
  const world = worldInstance;
  const builder = world?.getSystem(LevelBuilderSystem);
  if (!world || !builder) return false;
  const phase = gameStore.phase;
  if (phase === 'playing') return true;
  if (phase === 'noSurfaces' || phase === 'requesting') {
    gameStore.startSurveying();
  }
  if (gameStore.phase === 'surveying') {
    gameStore.startBuilding(SYNTHETIC_LIVING_ROOM_PLAN, {
      source: 'procedural',
    });
    builder.build(SYNTHETIC_LIVING_ROOM_PLAN, SYNTHETIC_LIVING_ROOM);
    world
      .getSystem(ExplorerSystem)
      ?.begin(SYNTHETIC_LIVING_ROOM_PLAN, SYNTHETIC_LIVING_ROOM);
  }
  if (gameStore.phase === 'building') {
    gameStore.startPlaying();
  }
  exposeHooks(
    SYNTHETIC_LIVING_ROOM,
    SYNTHETIC_LIVING_ROOM_PLAN,
    builder.getSnapTargets(),
    countDrawCalls(world.scene),
    latestPlacement
  );
  return true;
}

async function startPlayableLevel(
  graph: SurfaceGraph,
  builder: LevelBuilderSystem,
  placement: PlacementSystem
): Promise<void> {
  if (!canBuildFromDirector(gameStore.phase)) {
    return;
  }
  const director = createDirectorClientFromEnv({
    search: typeof window === 'undefined' ? '' : window.location.search,
    storage: browserKv(),
    fetch: (input, init) => fetch(input, init),
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  });
  const result = await director.requestPlan(graph);
  if (!canBuildFromDirector(gameStore.phase)) {
    return;
  }
  applyDirectorResult(gameStore, result);
  builder.build(result.plan, graph);
  worldInstance?.getSystem(ExplorerSystem)?.begin(result.plan, graph);
  gameStore.startPlaying();
  exposeHooks(
    graph,
    result.plan,
    builder.getSnapTargets(),
    worldInstance ? countDrawCalls(worldInstance.scene) : 0,
    placement.debugApi()
  );
}

async function loadDebugOverlay(): Promise<void> {
  if (overlayRequested || !clientFlags.debug || !worldInstance) return;
  overlayRequested = true;
  const { bindDebugOverlay, DebugOverlaySystem } =
    await import('./debug/DebugOverlaySystem.js');
  bindDebugOverlay({
    store: gameStore,
    getGraph: () => latestGraph,
    refreshHooks: () => {
      exposeHooks();
    },
  });
  worldInstance.registerSystem(DebugOverlaySystem, { priority: -1 });
}

function addFixtureLights(world: World): void {
  world.scene.background = new Color(0x1a2332);
  const ambient = new AmbientLight(0xffffff, 0.55);
  const directional = new DirectionalLight(0xfff2d8, 1.15);
  directional.position.set(2.4, 4.2, 2.2);
  directional.castShadow = false;
  world.scene.add(ambient);
  world.scene.add(directional);
}

/**
 * Launch the XR session, or the desktop fixture path when
 * `?fixture=synthetic_living_room` is set. `?xr=1` with that fixture
 * starts a real IWER emulated AR session from this user-gesture call.
 *
 * Grab config always uses `features.grabbing: { useHandPinchForGrab: true }`.
 */
export async function launchXR(): Promise<World> {
  unlockAudio();
  bindAudioStore(gameStore);
  void preloadSounds();
  clientFlags = readClientFlags(
    typeof window === 'undefined' ? '' : window.location.search
  );
  const flags = clientFlags;
  const fixtureMode = isSyntheticLivingRoomFixture(flags);
  const fixtureXr = isFixtureXrSession(flags);
  ensureSessionController();
  registerSessionHooks();

  if (worldInstance) {
    if (!fixtureMode || fixtureXr) {
      worldInstance.launchXR();
    }
    return worldInstance;
  }

  const container = document.getElementById('scene-container');
  if (!container) {
    throw new Error('Missing #scene-container');
  }

  const grabbing = { useHandPinchForGrab: true as const };

  const xrOptions =
    fixtureMode && !fixtureXr
      ? {
          ...projectOptions,
          xr: false as const,
          level: undefined,
          features: {
            locomotion: false,
            grabbing,
            physics: false,
            sceneUnderstanding: false,
            environmentRaycast: false,
            spatialUI: {
              kit: 'horizon' as const,
            },
          },
          render: {
            ...projectOptions.render,
            camera: {
              position: [1.15, 1.25, 0.35] as [number, number, number],
              lookAt: [0.2, 0.5, -1.65] as [number, number, number],
            },
          },
        }
      : {
          ...projectOptions,
          xr: {
            sessionMode: SessionMode.ImmersiveAR,
            offer: 'none' as const,
            features: {
              handTracking: { required: true },
              planeDetection: true,
              meshDetection: true,
              anchors: true,
              hitTest: true,
              gazeTracking: true,
            },
          },
          features: {
            locomotion: false,
            grabbing,
            sceneUnderstanding: true,
            environmentRaycast: true,
            gaze: {
              logDiagnostics: true,
            },
            spatialUI: {
              kit: 'horizon' as const,
            },
          },
        };

  worldInstance = await World.create(container, xrOptions);
  worldInstance.registerSystem(LevelBuilderSystem, { priority: 5 });
  bindHudStore(gameStore);
  bindGuidanceStore(gameStore);
  worldInstance.registerSystem(HudSystem, { priority: 0 });
  worldInstance.registerSystem(GuidanceSystem, { priority: 1 });
  // After GrabSystem (-3) so the held world pose is current for the ghost.
  worldInstance.registerSystem(PlacementSystem, { priority: -2 });
  // Before GuidanceSystem (1) so gaze/edge-arrow read the current pose.
  worldInstance.registerSystem(ExplorerSystem, { priority: -1 });
  worldInstance.registerSystem(GateLeverSystem, { priority: 3 });
  // X-09: after the hut exists; event-driven, not on the grab hot path.
  worldInstance.registerSystem(VillageAnchorSystem, { priority: 6 });
  await loadDebugOverlay();

  const builder = worldInstance.getSystem(LevelBuilderSystem);
  if (!builder) {
    throw new Error('LevelBuilderSystem failed to register');
  }
  const placement = worldInstance.getSystem(PlacementSystem);
  if (!placement) {
    throw new Error('PlacementSystem failed to register');
  }
  placement.configure({ builder, store: gameStore });
  const explorer = worldInstance.getSystem(ExplorerSystem);
  if (!explorer) {
    throw new Error('ExplorerSystem failed to register');
  }
  explorer.configure({ builder, store: gameStore });
  const gateLever = worldInstance.getSystem(GateLeverSystem);
  if (!gateLever) {
    throw new Error('GateLeverSystem failed to register');
  }
  gateLever.configure({ builder, store: gameStore });
  setExplorerTarget(explorer);
  bindVisibilityPause(worldInstance);
  registerRqHook('explorer', explorer.debugApi(), {
    flags: clientFlags,
    isDev: import.meta.env.DEV,
  });
  const villageAnchor = worldInstance.getSystem(VillageAnchorSystem);
  if (!villageAnchor) {
    throw new Error('VillageAnchorSystem failed to register');
  }
  villageAnchor.configure({
    builder,
    storage: villageAnchorStorage(),
    expectSession: fixtureXr || !fixtureMode,
  });
  registerRqHook('villageAnchor', villageAnchor.debugApi(), {
    flags: clientFlags,
    isDev: import.meta.env.DEV,
  });
  registerRqHook('gateLever', gateLever.debugApi(), {
    flags: clientFlags,
    isDev: import.meta.env.DEV,
  });
  builder.addEventListener('levelBuilt', () => {
    placement.onLevelRebuilt();
    gateLever.onLevelRebuilt();
  });

  if (fixtureMode) {
    const landing = document.getElementById('landing-page');
    if (landing) landing.style.display = 'none';
    addFixtureLights(worldInstance);
    gameStore.requestLevel();
    gameStore.startSurveying();
    gameStore.startBuilding(SYNTHETIC_LIVING_ROOM_PLAN, {
      source: 'procedural',
    });
    builder.build(SYNTHETIC_LIVING_ROOM_PLAN, SYNTHETIC_LIVING_ROOM);
    explorer.begin(SYNTHETIC_LIVING_ROOM_PLAN, SYNTHETIC_LIVING_ROOM);
    if (flags.debug) {
      builder.setDebugGraph(SYNTHETIC_LIVING_ROOM);
    }
    gameStore.startPlaying();
    exposeHooks(
      SYNTHETIC_LIVING_ROOM,
      SYNTHETIC_LIVING_ROOM_PLAN,
      builder.getSnapTargets(),
      countDrawCalls(worldInstance.scene),
      placement.debugApi()
    );
    console.log('[X-05] Fixture level built', {
      pieces: SYNTHETIC_LIVING_ROOM_PLAN.placements.length,
      snapTargets: builder.getSnapTargets().length,
      drawCalls: window.__rq?.drawCalls,
      debug: flags.debug,
      xr: fixtureXr,
      grabbing: grabbing.useHandPinchForGrab,
    });
    if (fixtureXr) {
      worldInstance.launchXR();
    }
  } else {
    gameStore.requestLevel();
    gameStore.startSurveying();
    exposeHooks(null, null, [], 0, placement.debugApi());
    worldInstance.registerSystem(SurfaceGraphSystem, { priority: 10 });
    const graphSystem = worldInstance.getSystem(SurfaceGraphSystem);
    if (graphSystem) {
      graphSystem.addEventListener('graphReady', (event: Event) => {
        const graph = (event as CustomEvent<SurfaceGraph>).detail;
        if (flags.debug) {
          builder.setDebugGraph(graph);
        }
        if (gameStore.plan) {
          explorer.begin(gameStore.plan, graph);
        }
        exposeHooks(
          graph,
          gameStore.plan,
          builder.getSnapTargets(),
          0,
          placement.debugApi()
        );
        void startPlayableLevel(graph, builder, placement);
      });
      graphSystem.addEventListener('noSurfaces', () => {
        gameStore.noSurfaces();
      });
    }
    worldInstance.launchXR();
  }

  return worldInstance;
}

/**
 * Get the current world instance (if initialized)
 */
export function getWorld(): World | null {
  return worldInstance;
}

export function getGameStore(): ReturnType<typeof createGameStore> {
  return gameStore;
}
