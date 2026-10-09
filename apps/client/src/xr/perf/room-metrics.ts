import { Group } from '@iwsdk/core';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import type { EmulatorRoom } from '../flags.js';
import { EMULATOR_ROOMS } from '../flags.js';
import { createExplorerModel } from '../explorer/model.js';
import {
  countDrawCalls,
  countTriangles,
  DRAW_CALL_BUDGET,
  TRIANGLE_BUDGET,
} from '../level/draw-calls.js';
import { mountGreyboxLevel } from '../level/mount-level.js';
import { fullKitPlan } from './full-kit-plan.js';

/**
 * IWER capture mesh cost with SceneUnderstanding wireframes off (IWSDK
 * default). Global-mesh triangles exist in the capture but are not drawn.
 * Counts decoded from `@iwer/sem` capture JSON (uint32 indices).
 */
export interface IwerRoomCapture {
  room: EmulatorRoom;
  entities: number;
  planes: number;
  boxes: number;
  hiddenGlobalTris: number;
}

export const IWER_ROOM_CAPTURES: readonly IwerRoomCapture[] = [
  {
    room: 'living_room',
    entities: 26,
    planes: 17,
    boxes: 8,
    hiddenGlobalTris: 62102,
  },
  {
    room: 'meeting_room',
    entities: 21,
    planes: 18,
    boxes: 2,
    hiddenGlobalTris: 16704,
  },
  {
    room: 'music_room',
    entities: 20,
    planes: 15,
    boxes: 4,
    hiddenGlobalTris: 86786,
  },
  {
    room: 'office_large',
    entities: 38,
    planes: 24,
    boxes: 13,
    hiddenGlobalTris: 22188,
  },
  {
    room: 'office_small',
    entities: 14,
    planes: 10,
    boxes: 3,
    hiddenGlobalTris: 3822,
  },
];

export interface RoomPerfRow {
  room: EmulatorRoom;
  drawCalls: number;
  triangles: number;
  hiddenEnvTris: number;
  frameTimeMs: number | null;
  source: 'scene-graph' | 'overlay';
  withinBudget: boolean;
}

export interface LevelSceneCounts {
  drawCalls: number;
  triangles: number;
}

/** Mount the full 14-piece kit plus explorer; count visible Mesh draw calls/tris. */
export function measureFullLevelScene(): LevelSceneCounts {
  const scene = new Group();
  const mounted = mountGreyboxLevel(
    scene,
    fullKitPlan(),
    SYNTHETIC_LIVING_ROOM
  );
  mounted.syncInstances();
  scene.add(createExplorerModel());
  const counts = {
    drawCalls: countDrawCalls(scene),
    triangles: countTriangles(scene),
  };
  mounted.dispose();
  return counts;
}

export function roomRowsFromLevelScene(
  counts: LevelSceneCounts,
  frameTimeMs: number | null = null,
  source: RoomPerfRow['source'] = 'scene-graph'
): RoomPerfRow[] {
  return IWER_ROOM_CAPTURES.map((capture) => {
    const drawCalls = counts.drawCalls;
    const triangles = counts.triangles;
    return {
      room: capture.room,
      drawCalls,
      triangles,
      hiddenEnvTris: capture.hiddenGlobalTris,
      frameTimeMs,
      source,
      withinBudget: drawCalls < DRAW_CALL_BUDGET && triangles < TRIANGLE_BUDGET,
    };
  });
}

export function formatRoomTable(rows: RoomPerfRow[]): string {
  const header =
    '| Room | Draw calls | Triangles | Hidden env tris | Frame time | Source | Budget |';
  const sep = '|---|---:|---:|---:|---:|---|---|';
  const body = rows.map((row) => {
    const frame =
      row.frameTimeMs === null || !Number.isFinite(row.frameTimeMs)
        ? '-'
        : `${row.frameTimeMs.toFixed(2)} ms`;
    const budget = row.withinBudget ? 'pass' : 'FAIL';
    return `| ${row.room} | ${String(row.drawCalls)} | ${String(row.triangles)} | ${String(row.hiddenEnvTris)} | ${frame} | ${row.source} | ${budget} |`;
  });
  return [header, sep, ...body].join('\n');
}

export function allRoomsMeasured(rows: RoomPerfRow[]): boolean {
  const seen = new Set(rows.map((row) => row.room));
  return EMULATOR_ROOMS.every((room) => seen.has(room));
}
