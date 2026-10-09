import { describe, expect, it } from 'vitest';
import { EMULATOR_ROOMS } from '../flags.js';
import { DRAW_CALL_BUDGET, TRIANGLE_BUDGET } from '../level/draw-calls.js';
import { fullKitPlan, fullKitUsesEveryPiece } from './full-kit-plan.js';
import {
  allRoomsMeasured,
  formatRoomTable,
  IWER_ROOM_CAPTURES,
  measureFullLevelScene,
  roomRowsFromLevelScene,
} from './room-metrics.js';

describe('full-kit plan', () => {
  it('places every piece id exactly in a 14-piece plan', () => {
    const plan = fullKitPlan();
    expect(plan.placements).toHaveLength(14);
    expect(fullKitUsesEveryPiece(plan)).toBe(true);
  });
});

describe('room metrics', () => {
  it('covers all five IWER rooms', () => {
    expect(IWER_ROOM_CAPTURES.map((row) => row.room).sort()).toEqual(
      [...EMULATOR_ROOMS].sort()
    );
  });

  it('keeps the full level under the X-10 draw-call and triangle budgets in every room', () => {
    const counts = measureFullLevelScene();
    expect(counts.drawCalls).toBeGreaterThan(0);
    expect(counts.drawCalls).toBeLessThan(DRAW_CALL_BUDGET);
    expect(counts.triangles).toBeGreaterThan(0);
    expect(counts.triangles).toBeLessThan(TRIANGLE_BUDGET);

    const rows = roomRowsFromLevelScene(counts);
    expect(allRoomsMeasured(rows)).toBe(true);
    for (const row of rows) {
      expect(row.withinBudget, row.room).toBe(true);
      expect(row.drawCalls).toBe(counts.drawCalls);
      expect(row.triangles).toBe(counts.triangles);
    }

    const table = formatRoomTable(rows);
    expect(table).toContain('| living_room |');
    expect(table).toContain('| music_room |');
    expect(table).toContain('pass');
    console.log('[X-10] full-level scene counts', counts);
    console.log(table);
  });
});
