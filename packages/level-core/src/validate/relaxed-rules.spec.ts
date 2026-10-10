import { describe, expect, it } from 'vitest';
import { IWER_GRAPHS, type IwerRoomId } from '@roomquest/fixtures';
import type { RelaxedRule } from '@roomquest/schema';
import { relaxedRulesFor } from './relaxed-rules';

const EXPECTED: Record<IwerRoomId, readonly RelaxedRule[]> = {
  living_room: ['hutTable', 'portalFov'],
  meeting_room: ['minPath'],
  music_room: ['hutTable'],
  office_large: ['hutTable'],
  office_small: [],
};

describe('relaxedRulesFor IWER waiver ids', () => {
  it.each(
    (Object.keys(EXPECTED) as IwerRoomId[]).map((room) => ({
      room,
      expected: [...EXPECTED[room]],
    }))
  )('$room reports $expected', ({ room, expected }) => {
    expect(relaxedRulesFor(IWER_GRAPHS[room])).toEqual(expected);
  });
});
