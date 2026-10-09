import { describe, it, expect } from 'vitest';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from '@iwsdk/core';
import type { Placement } from '@roomquest/schema';
import { PlacementController, TRAY_RETURN_MS } from './controller.js';
import type { MountedPiece, SnapTarget } from '../level/types.js';

function makePiece(
  id: string,
  piece: Placement['piece'],
  slotX: number
): MountedPiece {
  const geometry = new BoxGeometry(0.1, 0.02, 0.05);
  const material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material);
  mesh.name = id;
  const object = new Group();
  object.name = id;
  object.add(mesh);
  object.position.set(slotX, 0, 0);
  const placement: Placement = {
    id,
    piece,
    surface: 's1',
    u: 0.5,
    v: 0.5,
    playerBuilt: true,
    links: [],
  };
  return {
    placement,
    object,
    pose: { position: [1, 0.5, -1], yaw: 0.2 },
    inTray: true,
    traySlot: { x: slotX, y: 0, z: 0 },
  };
}

function setup(clockNow: { t: number }) {
  const scene = new Group();
  const mount = new Group();
  const root = new Group();
  const tray = new Group();
  scene.add(mount);
  mount.add(root);
  mount.add(tray);

  const plank = makePiece('p2', 'plank_bridge', -0.04);
  const ramp = makePiece('p8', 'ramp', 0.04);
  tray.add(plank.object);
  tray.add(ramp.object);

  const targets: SnapTarget[] = [
    {
      placementId: 'p2',
      piece: 'plank_bridge',
      pose: { position: [1, 0.5, -1], yaw: 0.2 },
      filled: false,
    },
    {
      placementId: 'p8',
      piece: 'ramp',
      pose: { position: [2, 0.4, -1.5], yaw: 0 },
      filled: false,
    },
  ];

  const pieces = new Map<string, MountedPiece>([
    ['p2', plank],
    ['p8', ramp],
  ]);

  const built: string[] = [];
  const disabled: string[] = [];
  const grabbed: string[] = [];

  const controller = new PlacementController({
    getTargets: () => targets,
    getPiece: (id) => pieces.get(id),
    getTray: () => tray,
    getLevelRoot: () => root,
    getMount: () => mount,
    clock: { now: () => clockNow.t },
    onPieceBuilt: (id) => {
      built.push(id);
    },
    onDisableGrab: (id) => {
      disabled.push(id);
    },
    onGrab: (id) => {
      grabbed.push(id);
    },
  });

  return {
    controller,
    plank,
    ramp,
    targets,
    built,
    disabled,
    grabbed,
    root,
    tray,
  };
}

describe('PlacementController', () => {
  it('left-hand grab shows a ghost in range and snaps on release', () => {
    const clock = { t: 0 };
    const { controller, plank, targets, built, disabled, grabbed, root } =
      setup(clock);

    expect(controller.grab('p2', 'left', true)).toBe(true);
    expect(grabbed).toEqual(['p2']);
    expect(controller.heldPlacementHand).toBe('left');
    expect(controller.moveTo(1.04, 0.5, -1)).toBe(true);
    expect(controller.isGhostVisible).toBe(true);
    expect(controller.activeGhostTarget?.placementId).toBe('p2');

    expect(controller.release()).toBe('snap');
    expect(built).toEqual(['p2']);
    expect(disabled).toEqual(['p2']);
    expect(targets[0]?.filled).toBe(true);
    expect(plank.inTray).toBe(false);
    expect(plank.object.parent).toBe(root);
    expect(plank.object.position.x).toBeCloseTo(1, 6);
    expect(plank.object.position.y).toBeCloseTo(0.5, 6);
    expect(plank.object.position.z).toBeCloseTo(-1, 6);
    expect(plank.object.rotation.y).toBeCloseTo(0.2, 6);
    expect(controller.isGhostVisible).toBe(false);
  });

  it('right-hand grab of the ramp snaps to its own target', () => {
    const clock = { t: 0 };
    const { controller, ramp, built, disabled, root } = setup(clock);

    expect(controller.grab('p8', 'right', true)).toBe(true);
    expect(controller.heldPlacementHand).toBe('right');
    expect(controller.moveToTarget()).toBe(true);
    expect(controller.isGhostVisible).toBe(true);
    expect(controller.release()).toBe('snap');
    expect(built).toEqual(['p8']);
    expect(disabled).toEqual(['p8']);
    expect(ramp.object.parent).toBe(root);
    expect(ramp.object.position.x).toBeCloseTo(2, 6);
  });

  it('hides the ghost out of range and tweens back to the tray slot', () => {
    const clock = { t: 0 };
    const { controller, plank, tray } = setup(clock);

    expect(controller.grab('p2', 'left', true)).toBe(true);
    expect(controller.moveTo(4, 1, 4)).toBe(true);
    expect(controller.isGhostVisible).toBe(false);
    expect(controller.release()).toBe('return');
    expect(plank.object.parent).toBe(tray);
    expect(controller.isTweening).toBe(true);

    clock.t = TRAY_RETURN_MS;
    controller.tick();
    expect(controller.isTweening).toBe(false);
    expect(plank.object.position.x).toBeCloseTo(plank.traySlot.x, 6);
    expect(plank.object.position.y).toBeCloseTo(plank.traySlot.y, 6);
    expect(plank.object.position.z).toBeCloseTo(plank.traySlot.z, 6);
  });

  it('does not snap a plank onto a ramp target at the same pose', () => {
    const clock = { t: 0 };
    const { controller, targets } = setup(clock);
    const rampTarget = targets[1];
    if (!rampTarget) throw new Error('missing ramp target');

    expect(controller.grab('p2', 'right', true)).toBe(true);
    const p = rampTarget.pose.position;
    controller.moveTo(p[0], p[1], p[2]);
    expect(controller.isGhostVisible).toBe(false);
    expect(controller.release()).toBe('return');
  });
});
