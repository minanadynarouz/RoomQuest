import { describe, expect, it } from 'vitest';
import { IWER_GRAPHS, SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { createGameStore } from '../../game/store.js';
import { countDrawCalls, countTriangles } from '../level/draw-calls.js';
import { createExplorerModel } from './model.js';
import {
  largestOpenFloor,
  onRoomUnplayableEvent,
  RESCAN_DURATION_S,
  RESCAN_LOOK_S,
  RescanAnimator,
  rescanPoseAt,
  yawToward,
  type RescanPose,
} from './rescan.js';

function pose(): RescanPose {
  return { yaw: 0, lean: 0, scaleY: 1, scaleXZ: 1, lift: 0 };
}

describe('Pip rescan animation', () => {
  it('looks left and right, shrugs, then turns to the target', () => {
    const p = pose();
    const yaws: number[] = [];
    for (let t = 0; t < RESCAN_LOOK_S; t += 0.05) {
      yaws.push(rescanPoseAt(t, 1.2, p).yaw);
    }
    expect(Math.max(...yaws)).toBeGreaterThan(0.3);
    expect(Math.min(...yaws)).toBeLessThan(-0.3);
    let minY = 1;
    let maxY = 1;
    for (let t = RESCAN_LOOK_S; t < RESCAN_LOOK_S + 0.45; t += 0.02) {
      const s = rescanPoseAt(t, 1.2, p).scaleY;
      minY = Math.min(minY, s);
      maxY = Math.max(maxY, s);
    }
    expect(minY).toBeLessThan(0.9);
    expect(maxY).toBeGreaterThan(1.02);
    const end = rescanPoseAt(RESCAN_DURATION_S, 1.2, p);
    expect(end.yaw).toBeCloseTo(1.2, 5);
    expect(end.lean).toBeGreaterThan(0);
    expect(end.scaleY).toBe(1);
  });

  it('points at the largest open floor of each graph', () => {
    for (const graph of [SYNTHETIC_LIVING_ROOM, ...Object.values(IWER_GRAPHS)]) {
      const node = largestOpenFloor(graph);
      expect(node).not.toBeNull();
      const floors = graph.nodes.filter((n) => n.label === 'floor');
      if (floors.length > 0) {
        expect(node?.label).toBe('floor');
        expect(node?.area).toBe(Math.max(...floors.map((n) => n.area)));
      }
    }
    expect(yawToward(0, 0, 0, 1)).toBeCloseTo(0);
    expect(yawToward(0, 0, 1, 0)).toBeCloseTo(Math.PI / 2);
  });

  it('runs on the roomUnplayable event and keeps the draw-call count unchanged', () => {
    const model = createExplorerModel();
    const mesh = model.children[0] ?? null;
    const drawBefore = countDrawCalls(model);
    const trisBefore = countTriangles(model);
    const childrenBefore = model.children.length;
    const materialBefore = (mesh as unknown as { material: unknown }).material;

    const store = createGameStore({ clock: { now: () => 1000 } });
    const anim = new RescanAnimator();
    let fired = 0;
    const stop = onRoomUnplayableEvent(store, () => {
      fired += 1;
      anim.start(0, 0, 0, 1, 0);
    });
    store.requestLevel();
    store.startSurveying();
    expect(anim.active).toBe(false);
    store.markRoomUnplayable();
    expect(fired).toBe(1);
    expect(anim.active).toBe(true);

    let steps = 0;
    let sawYaw = false;
    while (anim.step(1 / 72, mesh)) {
      steps += 1;
      if (Math.abs(mesh?.rotation.y ?? 0) > 0.3) sawYaw = true;
      expect(countDrawCalls(model)).toBe(drawBefore);
    }
    stop();
    expect(sawYaw).toBe(true);
    expect(steps).toBeGreaterThan(RESCAN_DURATION_S * 60);
    expect(mesh?.rotation.y).toBeCloseTo(Math.PI / 2, 3);
    expect(countDrawCalls(model)).toBe(drawBefore);
    expect(countTriangles(model)).toBe(trisBefore);
    expect(model.children.length).toBe(childrenBefore);
    expect((mesh as unknown as { material: unknown }).material).toBe(materialBefore);
    anim.stop(mesh);
    expect(mesh?.scale.y).toBe(1);
  });
});
