import { describe, it, expect } from 'vitest';
import { Group } from '@iwsdk/core';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { PIECE_IDS } from '@roomquest/schema';
import { fullKitPlan } from '../perf/full-kit-plan.js';
import { mountGreyboxLevel } from './mount-level.js';
import {
  countDrawCalls,
  countTriangles,
  DRAW_CALL_BUDGET,
  TRIANGLE_BUDGET,
} from './draw-calls.js';

const TOP_TOLERANCE_M = 0.02;

function surfaceTop(surfaceId: string): number {
  const node = SYNTHETIC_LIVING_ROOM.nodes.find((n) => n.id === surfaceId);
  if (!node) {
    throw new Error(`missing surface ${surfaceId}`);
  }
  return SYNTHETIC_LIVING_ROOM.floorY + node.topHeight;
}

describe('mountGreyboxLevel', () => {
  it('sits every fixture piece base within 2 cm of its surface top', () => {
    const scene = new Group();
    const mounted = mountGreyboxLevel(
      scene,
      SYNTHETIC_LIVING_ROOM_PLAN,
      SYNTHETIC_LIVING_ROOM
    );
    mounted.syncInstances();
    scene.updateMatrixWorld(true);

    expect(mounted.pieces).toHaveLength(
      SYNTHETIC_LIVING_ROOM_PLAN.placements.length
    );

    for (const piece of mounted.pieces) {
      const top = surfaceTop(piece.placement.surface);
      if (piece.inTray) {
        const snap = mounted.snapTargets.find(
          (t) => t.placementId === piece.placement.id
        );
        expect(snap, piece.placement.id).toBeDefined();
        if (!snap) continue;
        expect(
          Math.abs(snap.pose.position[1] - top),
          `${piece.placement.id} snap y`
        ).toBeLessThan(TOP_TOLERANCE_M);
      } else {
        piece.object.updateWorldMatrix(true, false);
        const y = piece.object.position.y;
        expect(
          Math.abs(y - top),
          `${piece.placement.id} (${piece.placement.piece}) y=${String(y)} top=${String(top)}`
        ).toBeLessThan(TOP_TOLERANCE_M);
      }
    }

    mounted.dispose();
  });

  it('keeps a 14-piece level under 60 draw calls', () => {
    const scene = new Group();
    const plan = fullKitPlan();
    expect(plan.placements).toHaveLength(14);
    const used = new Set(plan.placements.map((p) => p.piece));
    for (const id of PIECE_IDS) {
      expect(used.has(id), id).toBe(true);
    }

    const mounted = mountGreyboxLevel(scene, plan, SYNTHETIC_LIVING_ROOM);
    mounted.syncInstances();

    const drawCalls = countDrawCalls(scene);
    const triangles = countTriangles(scene);
    console.log('[X-03] 14-piece draw calls:', drawCalls, 'tris:', triangles);
    expect(drawCalls).toBeGreaterThan(0);
    expect(drawCalls).toBeLessThan(60);
    expect(drawCalls).toBeLessThan(DRAW_CALL_BUDGET);
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThan(TRIANGLE_BUDGET);

    mounted.dispose();
  });

  it('parks playerBuilt pieces in the tray and records snap targets', () => {
    const scene = new Group();
    const mounted = mountGreyboxLevel(
      scene,
      SYNTHETIC_LIVING_ROOM_PLAN,
      SYNTHETIC_LIVING_ROOM
    );
    const built = SYNTHETIC_LIVING_ROOM_PLAN.placements.filter(
      (p) => p.playerBuilt
    );
    expect(mounted.snapTargets).toHaveLength(built.length);
    for (const piece of mounted.pieces) {
      if (piece.inTray) {
        expect(piece.object.parent).toBe(mounted.tray);
        expect(piece.traySlot).toEqual({
          x: piece.object.position.x,
          y: piece.object.position.y,
          z: piece.object.position.z,
        });
      }
    }
    for (const target of mounted.snapTargets) {
      expect(target.filled).toBe(false);
    }
    mounted.dispose();
  });
});
