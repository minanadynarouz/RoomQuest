/**
 * XR session initialization and launch
 * X-03: LevelBuilderSystem, greybox kit, fixture / debug URL flags
 * F-04: spatial HUD panels (lazy-loaded with this XR module)
 * X-04: PlacementSystem pinch-place with snap
 * F-05: debug overlay + window.__rq (dev or ?debug=1); overlay lazy-loads
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
  applyRqHooks,
  createStatsGetter,
  isOverlayReady,
  type RqDebugHooks,
} from '../debug/hooks.js';
import { collectPerfStats } from '../debug/stats.js';
import { parseUrlFlags, type UrlFlags } from '../debug/url-flags.js';
import { createGameStore } from '../game/index.js';
import { bindHudStore, HudSystem } from '../ui/HudSystem.js';
import { isSyntheticLivingRoomFixture } from './flags.js';
import { LevelBuilderSystem } from './systems/LevelBuilderSystem.js';
import {
  PlacementSystem,
  type PlacementDebugApi,
} from './systems/PlacementSystem.js';
import { SurfaceGraphSystem } from './systems/SurfaceGraphSystem.js';
import { countDrawCalls } from './level/draw-calls.js';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import type { SnapTarget } from './level/types.js';

export type { RqDebugHooks, RqHudDebug } from '../debug/hooks.js';

let worldInstance: World | null = null;
const gameStore = createGameStore();
let latestGraph: SurfaceGraph | null = null;
let latestPlan: LevelPlan | null = null;
let latestSnapTargets: readonly SnapTarget[] = [];
let latestSceneDrawCalls = 0;
let latestPlacement: PlacementDebugApi | null = null;
let clientFlags: UrlFlags = parseUrlFlags('');
let overlayRequested = false;

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
  applyRqHooks(
    clientFlags,
    import.meta.env.DEV,
    window,
    (): RqDebugHooks => ({
      store: gameStore,
      graph: latestGraph,
      plan: latestPlan,
      snapTargets: latestSnapTargets,
      drawCalls: latestSceneDrawCalls,
      hud: window.__rq?.hud,
      overlay: isOverlayReady() ? { ready: true } : window.__rq?.overlay,
      placement: latestPlacement,
      stats: statsGetter,
      autoSolve: window.__rq?.autoSolve,
    })
  );
}

async function loadDebugOverlay(): Promise<void> {
  if (overlayRequested || !clientFlags.debug || !worldInstance) return;
  overlayRequested = true;
  const { bindDebugOverlay, DebugOverlaySystem } = await import(
    '../debug/DebugOverlaySystem.js'
  );
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
 * `?fixture=synthetic_living_room` is set.
 *
 * Grab config always uses `features.grabbing: { useHandPinchForGrab: true }`.
 */
export async function launchXR(): Promise<World> {
  clientFlags = parseUrlFlags(
    typeof window === 'undefined' ? '' : window.location.search
  );
  const flags = clientFlags;
  const fixtureMode = isSyntheticLivingRoomFixture(flags);

  if (worldInstance) {
    if (!fixtureMode) {
      worldInstance.launchXR();
    }
    return worldInstance;
  }

  const container = document.getElementById('scene-container');
  if (!container) {
    throw new Error('Missing #scene-container');
  }

  const grabbing = { useHandPinchForGrab: true as const };

  const xrOptions = fixtureMode
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
  worldInstance.registerSystem(HudSystem, { priority: 0 });
  // After GrabSystem (-3) so the held world pose is current for the ghost.
  worldInstance.registerSystem(PlacementSystem, { priority: -2 });
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
  builder.addEventListener('levelBuilt', () => {
    placement.onLevelRebuilt();
  });

  if (fixtureMode) {
    const landing = document.getElementById('landing-page');
    if (landing) landing.style.display = 'none';
    addFixtureLights(worldInstance);
    gameStore.requestLevel();
    gameStore.startSurveying();
    gameStore.startBuilding(SYNTHETIC_LIVING_ROOM_PLAN);
    builder.build(SYNTHETIC_LIVING_ROOM_PLAN, SYNTHETIC_LIVING_ROOM);
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
    console.log('[X-04] Fixture level built', {
      pieces: SYNTHETIC_LIVING_ROOM_PLAN.placements.length,
      snapTargets: builder.getSnapTargets().length,
      drawCalls: window.__rq?.drawCalls,
      debug: flags.debug,
      grabbing: grabbing.useHandPinchForGrab,
    });
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
        exposeHooks(
          graph,
          gameStore.plan,
          builder.getSnapTargets(),
          0,
          placement.debugApi()
        );
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
