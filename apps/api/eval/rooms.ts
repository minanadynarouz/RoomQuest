import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
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

/**
 * Load up to {@link EVAL_MAX_ROOMS} room fixtures.
 *
 * Prefer `packages/fixtures/rooms/*.json` (X-02 emulator exports) when that
 * directory has parseable graphs. Otherwise fall back to
 * `synthetic_living_room` from `@roomquest/fixtures`.
 */
export function loadEvalRooms(
  repoRoot: string,
  logger: DirectorLogger,
  maxRooms: number = EVAL_MAX_ROOMS
): EvalRoom[] {
  const limit = Math.max(1, Math.min(maxRooms, EVAL_MAX_ROOMS));
  const roomsDir = join(repoRoot, 'packages', 'fixtures', 'rooms');
  const fromDisk: EvalRoom[] = [];

  if (existsSync(roomsDir)) {
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
        logger.warn(
          `eval.rooms skip unreadable file=${file} message=${message}`
        );
      }
    }
  }

  const rooms =
    fromDisk.length > 0
      ? fromDisk
      : [
          {
            id: 'synthetic_living_room',
            graph: SYNTHETIC_LIVING_ROOM,
          },
        ];

  return rooms.slice(0, limit);
}
