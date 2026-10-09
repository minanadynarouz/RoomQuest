/**
 * XR session initialization and launch
 * X-03: LevelBuilderSystem, greybox kit, fixture / debug URL flags
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
import { createGameStore } from '../game/index.js';
import { readClientFlags, isSyntheticLivingRoomFixture } from './flags.js';
import { LevelBuilderSystem } from './systems/LevelBuilderSystem.js';
import { SurfaceGraphSystem } from './systems/SurfaceGraphSystem.js';
import { countDrawCalls } from './level/draw-calls.js';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import type { SnapTarget } from './level/types.js';

let worldInstance: World | null = null;
const gameStore = createGameStore();

export interface RqDebugHooks {
  store: ReturnType<typeof createGameStore>;
  graph: SurfaceGraph | null;
  plan: LevelPlan | null;
  snapTargets: readonly SnapTarget[];
  drawCalls: number;
}

declare global {
  interface Window {
    __rq?: RqDebugHooks;
  }
}

function exposeHooks(
  graph: SurfaceGraph | null,
  plan: LevelPlan | null,
  snapTargets: readonly SnapTarget[] = [],
  drawCalls = 0
): void {
  if (typeof window === 'undefined') return;
  window.__rq = {
    store: gameStore,
    graph,
    plan,
    snapTargets,
    drawCalls,
  };
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
  const flags = readClientFlags();
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
          spatialUI: false,
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

  const builder = worldInstance.getSystem(LevelBuilderSystem);
  if (!builder) {
    throw new Error('LevelBuilderSystem failed to register');
  }

  if (fixtureMode) {
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
      countDrawCalls(worldInstance.scene)
    );
    console.log('[X-03] Fixture level built', {
      pieces: SYNTHETIC_LIVING_ROOM_PLAN.placements.length,
      snapTargets: builder.getSnapTargets().length,
      drawCalls: window.__rq?.drawCalls,
      debug: flags.debug,
    });
  } else {
    gameStore.requestLevel();
    gameStore.startSurveying();
    worldInstance.registerSystem(SurfaceGraphSystem, { priority: 10 });
    const graphSystem = worldInstance.getSystem(SurfaceGraphSystem);
    if (graphSystem) {
      graphSystem.addEventListener('graphReady', (event: Event) => {
        const graph = (event as CustomEvent<SurfaceGraph>).detail;
        if (flags.debug) {
          builder.setDebugGraph(graph);
        }
        exposeHooks(graph, gameStore.plan, builder.getSnapTargets());
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
