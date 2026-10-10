import { describe, expect, it } from 'vitest';
import { IWER_ROOM_IDS } from '@roomquest/fixtures';
import { findRepoRoot } from './paths';
import { loadEvalRooms } from './rooms';

const silentLogger = {
  log: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
};

describe('loadEvalRooms', () => {
  it('loads the five IWER_GRAPHS exports first', () => {
    const rooms = loadEvalRooms(findRepoRoot(__dirname), silentLogger);
    expect(rooms.map((room) => room.id)).toEqual([...IWER_ROOM_IDS]);
    expect(rooms).toHaveLength(5);
  });

  it('honors roomLimit while keeping IWER order', () => {
    const rooms = loadEvalRooms(findRepoRoot(__dirname), silentLogger, 1);
    expect(rooms.map((room) => room.id)).toEqual(['living_room']);
  });
});
