/**
 * Pip "rescan" reaction for an unplayable room: look around (yaw left and
 * right), shrug (quick squash then raise), then turn and lean toward the
 * largest open floor area.
 *
 * Transforms only, on the existing explorer mesh (`explorer-mesh`, a child
 * of the walker-driven root): no new meshes, materials or draw calls.
 * Allocation-free per frame.
 */

import type { Object3D } from '@iwsdk/core';
import type { SurfaceGraph, SurfaceNode } from '@roomquest/schema';
import type { GameEvent } from '../../game/types.js';

export const RESCAN_LOOK_S = 1.1;
export const RESCAN_SHRUG_S = 0.45;
export const RESCAN_POINT_S = 0.75;
export const RESCAN_DURATION_S = RESCAN_LOOK_S + RESCAN_SHRUG_S + RESCAN_POINT_S;
/** Peak look-around yaw (rad). */
const LOOK_YAW = 0.6;
/** Shrug: squash, then a short raise. */
const SQUASH = 0.84;
const RAISE = 1.08;
const LIFT_M = 0.008;
/** Forward lean while pointing (rad, about local X). */
const POINT_LEAN = 0.22;

export interface RescanPose {
  /** Yaw offset relative to the root's yaw (rad). */
  yaw: number;
  /** Lean about local X (rad). */
  lean: number;
  scaleY: number;
  scaleXZ: number;
  lift: number;
}

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * Pose at `t` seconds into the animation. `pointYaw` is the yaw offset
 * that faces the target. Writes into `out` and returns it.
 */
export function rescanPoseAt(
  t: number,
  pointYaw: number,
  out: RescanPose
): RescanPose {
  out.lean = 0;
  out.scaleY = 1;
  out.scaleXZ = 1;
  out.lift = 0;
  if (t < RESCAN_LOOK_S) {
    // Left, right, back to centre.
    out.yaw = LOOK_YAW * Math.sin((t / RESCAN_LOOK_S) * Math.PI * 2);
    return out;
  }
  if (t < RESCAN_LOOK_S + RESCAN_SHRUG_S) {
    const s = (t - RESCAN_LOOK_S) / RESCAN_SHRUG_S;
    out.yaw = 0;
    const y = s < 0.4 ? 1 + (SQUASH - 1) * smooth(s / 0.4) : SQUASH + (RAISE - SQUASH) * smooth((s - 0.4) / 0.3) - (RAISE - 1) * smooth((s - 0.7) / 0.3);
    out.scaleY = y;
    out.scaleXZ = 1 + (1 - y) * 0.5;
    out.lift = y > 1 ? LIFT_M * ((y - 1) / (RAISE - 1)) : 0;
    return out;
  }
  const p = smooth((t - RESCAN_LOOK_S - RESCAN_SHRUG_S) / RESCAN_POINT_S);
  out.yaw = pointYaw * p;
  out.lean = POINT_LEAN * p;
  return out;
}

/** Same yaw convention as the walker: yaw 0 faces +Z. */
export function yawToward(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** Largest floor surface; else the largest surface of any label. */
export function largestOpenFloor(graph: SurfaceGraph): SurfaceNode | null {
  const byArea = (a: SurfaceNode, b: SurfaceNode): number =>
    b.area - a.area || a.id.localeCompare(b.id);
  const floors = graph.nodes.filter((n) => n.label === 'floor').sort(byArea);
  return floors[0] ?? [...graph.nodes].sort(byArea)[0] ?? null;
}

/** Subscribe `onRescan` to the store's `roomUnplayable` event. */
export function onRoomUnplayableEvent(
  store: { subscribeEvents: (fn: (event: GameEvent) => void) => () => void },
  onRescan: () => void
): () => void {
  return store.subscribeEvents((event) => {
    if (event.type === 'roomUnplayable') onRescan();
  });
}

/**
 * Drives {@link rescanPoseAt} on the explorer mesh. Call `start` on the
 * event and `step` every frame; `step` returns false once finished and
 * the mesh is back at rest (the root keeps the walker's pose).
 */
export class RescanAnimator {
  private t = -1;
  private pointYaw = 0;
  private readonly pose: RescanPose = { yaw: 0, lean: 0, scaleY: 1, scaleXZ: 1, lift: 0 };

  get active(): boolean {
    return this.t >= 0;
  }

  /** `rootYaw`: the walker's current yaw; target in world X/Z. */
  start(rootX: number, rootZ: number, rootYaw: number, targetX: number, targetZ: number): void {
    this.t = 0;
    this.pointYaw = wrapAngle(yawToward(rootX, rootZ, targetX, targetZ) - rootYaw);
  }

  /** Final yaw offset the animation turns to. */
  get targetYawOffset(): number {
    return this.pointYaw;
  }

  stop(mesh: Object3D | null): void {
    this.t = -1;
    if (mesh) rest(mesh);
  }

  step(delta: number, mesh: Object3D | null): boolean {
    if (this.t < 0 || !mesh) return false;
    this.t += Math.max(0, delta);
    if (this.t >= RESCAN_DURATION_S) {
      // Hold the final point pose; caller may rotate the root to match.
      rescanPoseAt(RESCAN_DURATION_S, this.pointYaw, this.pose);
      apply(mesh, this.pose);
      this.t = -1;
      return false;
    }
    rescanPoseAt(this.t, this.pointYaw, this.pose);
    apply(mesh, this.pose);
    return true;
  }
}

function apply(mesh: Object3D, pose: RescanPose): void {
  mesh.rotation.set(pose.lean, pose.yaw, 0);
  mesh.scale.set(pose.scaleXZ, pose.scaleY, pose.scaleXZ);
  mesh.position.set(0, pose.lift, 0);
}

function rest(mesh: Object3D): void {
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  mesh.position.set(0, 0, 0);
}
