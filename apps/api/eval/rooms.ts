import {
  IWER_GRAPHS,
  IWER_ROOM_IDS,
  SYNTHETIC_LIVING_ROOM,
} from '@roomquest/fixtures';
import { SurfaceGraph } from '@roomquest/schema';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DirectorLogger } from '../src/director/telemetry';
import { EVAL_MAX_ROOMS } from './constants';

export interface EvalRoom {
  id: string;
  graph: SurfaceGraph;
}

function parseRoomJson(raw: unknown): SurfaceGraph | undefined {
  const direct = SurfaceGraph.safeParse(raw);
  if (direct.success) {
    return direct.data;
  }
  if (typeof raw === 'object' && raw !== null && 'graph' in raw) {
    const nested = SurfaceGraph.safeParse(raw.graph);
    if (nested.success) {
      return nested.data;
    }
  }
  return undefined;
}

function loadDiskRooms(repoRoot: string, logger: DirectorLogger): EvalRoom[] {
  const roomsDir = join(repoRoot, 'packages', 'fixtures', 'rooms');
  const fromDisk: EvalRoom[] = [];

  if (!existsSync(roomsDir)) {
    return fromDisk;
  }

  const files = readdirSync(roomsDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  for (const file of files) {
    const full = join(roomsDir, file);
    try {
      const parsed: unknown = JSON.parse(readFileSync(full, 'utf8'));
      const graph = parseRoomJson(parsed);
      if (graph === undefined) {
        logger.warn(`eval.rooms skip invalid graph file=${file}`);
        continue;
      }
      fromDisk.push({
        id: file.replace(/\.json$/u, ''),
        graph,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error';
      logger.warn(`eval.rooms skip unreadable file=${file} message=${message}`);
    }
  }
  return fromDisk;
}

/**
 * Load up to {@link EVAL_MAX_ROOMS} room fixtures.
 *
 * Prefer the captured IWER graphs exported as `IWER_GRAPHS`, then any extra
 * `packages/fixtures/rooms/*.json` files not already in that set. Fall back
 * to `synthetic_living_room` only when both sources are empty.
 */
export function loadEvalRooms(
  repoRoot: string,
  logger: DirectorLogger,
  maxRooms: number = EVAL_MAX_ROOMS
): EvalRoom[] {
  const limit = Math.max(1, Math.min(maxRooms, EVAL_MAX_ROOMS));
  const seen = new Set<string>();
  const rooms: EvalRoom[] = [];

  for (const id of IWER_ROOM_IDS) {
    rooms.push({ id, graph: IWER_GRAPHS[id] });
    seen.add(id);
  }

  for (const room of loadDiskRooms(repoRoot, logger)) {
    if (seen.has(room.id)) {
      continue;
    }
    rooms.push(room);
    seen.add(room.id);
  }

  const resolved =
    rooms.length > 0
      ? rooms
      : [
          {
            id: 'synthetic_living_room',
            graph: SYNTHETIC_LIVING_ROOM,
          },
        ];

  return resolved.slice(0, limit);
}
