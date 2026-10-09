import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import { placementToPose } from '@roomquest/level-core';
import { Group, Mesh, type Object3D } from '@iwsdk/core';
import {
  createGreyboxKit,
  createPiece,
  type GreyboxKit,
} from '../pieces/index.js';
import { box } from '../pieces/geometry.js';
import {
  createSurfaceDebugOverlay,
  disposeSurfaceDebugOverlay,
} from '../debug/surface-debug.js';
import type { MountedPiece, SnapTarget } from './types.js';

const TRAY_WIDTH = 0.36;
const TRAY_DEPTH = 0.14;
const TRAY_ITEM_SPACING = 0.08;

export interface MountedLevel {
  kit: GreyboxKit;
  root: Group;
  tray: Group;
  pieces: MountedPiece[];
  snapTargets: SnapTarget[];
  debugRoot: Group | null;
  syncInstances: () => void;
  dispose: () => void;
}

export interface MountLevelOptions {
  debug?: boolean;
}

function createTrayBoard(kit: GreyboxKit): Group {
  const tray = new Group();
  tray.name = 'tray';
  const geo = box(
    TRAY_WIDTH,
    0.016,
    TRAY_DEPTH,
    0,
    -0.008,
    0,
    kit.palette.dark
  );
  const board = new Mesh(geo, kit.material);
  board.castShadow = false;
  board.receiveShadow = false;
  board.name = 'tray-board';
  tray.add(board);
  tray.userData.trayBoardGeometry = geo;
  return tray;
}

function layoutTrayItem(object: Object3D, index: number, count: number): void {
  const span = (count - 1) * TRAY_ITEM_SPACING;
  const x = count <= 1 ? 0 : -span / 2 + index * TRAY_ITEM_SPACING;
  object.position.set(x, 0, 0);
  object.rotation.set(0, 0, 0);
}

/**
 * Assemble a greybox level under `parent` using a Three.js scene graph only
 * (no ECS). Used by LevelBuilderSystem and the headless draw-call test.
 */
export function mountGreyboxLevel(
  parent: Object3D,
  plan: LevelPlan,
  graph: SurfaceGraph,
  options: MountLevelOptions = {}
): MountedLevel {
  const kit = createGreyboxKit(plan.theme);
  const root = new Group();
  root.name = 'levelRoot';
  parent.add(root);

  const tray = createTrayBoard(kit);
  parent.add(tray);

  // Instanced meshes stay at identity under `parent` so instance matrices are world poses.
  parent.add(kit.gemPool.mesh);
  parent.add(kit.plankPool.mesh);

  const pieces: MountedPiece[] = [];
  const snapTargets: SnapTarget[] = [];
  const trayPlacements = plan.placements.filter((p) => p.playerBuilt);
  let trayIndex = 0;

  for (const placement of plan.placements) {
    const object = createPiece(placement.piece, kit);
    object.userData.placementId = placement.id;
    object.userData.playerBuilt = placement.playerBuilt;
    object.name = placement.id;

    const pose = placementToPose(graph, placement);

    if (placement.playerBuilt) {
      snapTargets.push({
        placementId: placement.id,
        piece: placement.piece,
        pose,
        to: placement.to,
      });
      tray.add(object);
      layoutTrayItem(object, trayIndex, trayPlacements.length);
      trayIndex += 1;
      pieces.push({ placement, object, pose, inTray: true });
    } else {
      root.add(object);
      object.position.set(pose.position[0], pose.position[1], pose.position[2]);
      object.rotation.set(0, pose.yaw, 0);
      pieces.push({ placement, object, pose, inTray: false });
    }
  }

  kit.syncInstances();

  let debugRoot: Group | null = null;
  if (options.debug) {
    debugRoot = createSurfaceDebugOverlay(graph, kit.debugLineMaterial);
    parent.add(debugRoot);
  }

  return {
    kit,
    root,
    tray,
    pieces,
    snapTargets,
    debugRoot,
    syncInstances: () => {
      kit.syncInstances();
    },
    dispose: () => {
      if (debugRoot) {
        disposeSurfaceDebugOverlay(debugRoot);
        debugRoot = null;
      }
      const boardGeo = tray.userData.trayBoardGeometry as
        { dispose: () => void } | undefined;
      boardGeo?.dispose();
      tray.removeFromParent();
      root.removeFromParent();
      kit.dispose();
      pieces.length = 0;
      snapTargets.length = 0;
    },
  };
}
