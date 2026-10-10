import { describe, expect, it } from 'vitest';
import { Group } from '@iwsdk/core';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { countDrawCalls } from '../level/draw-calls.js';
import { measureFullLevelScene } from '../perf/room-metrics.js';
import {
  createRoomReadingHighlight,
  ROOM_READING_HIGHLIGHT_NAME,
} from './highlight.js';

describe('room-reading highlight draw calls', () => {
  it('adds one draw call while visible and zero when hidden', () => {
    const before = measureFullLevelScene();
    const scene = new Group();
    const highlight = createRoomReadingHighlight();
    scene.add(highlight.mesh);

    expect(highlight.mesh.name).toBe(ROOM_READING_HIGHLIGHT_NAME);
    expect(highlight.mesh.visible).toBe(false);
    expect(countDrawCalls(scene)).toBe(0);

    const node = SYNTHETIC_LIVING_ROOM.nodes[0];
    if (!node) {
      throw new Error('missing fixture node');
    }
    highlight.apply(SYNTHETIC_LIVING_ROOM, node, 1);
    expect(highlight.mesh.visible).toBe(true);
    expect(countDrawCalls(scene)).toBe(1);

    highlight.hide();
    expect(highlight.mesh.visible).toBe(false);
    expect(countDrawCalls(scene)).toBe(0);
    highlight.dispose();

    const after = measureFullLevelScene();
    expect(after.drawCalls).toBe(before.drawCalls);
    expect(before.drawCalls).toBeGreaterThanOrEqual(1);
    console.log('[room-reading] full-level draw calls before/after', {
      before: before.drawCalls,
      after: after.drawCalls,
      activeDelta: 1,
    });
  });
});
