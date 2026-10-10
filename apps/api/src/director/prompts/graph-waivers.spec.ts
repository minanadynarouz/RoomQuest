import { describe, expect, it } from 'vitest';
import {
  IWER_GRAPHS,
  IWER_ROOM_IDS,
  type IwerRoomId,
} from '@roomquest/fixtures';
import { buildUserMessage } from './messages';
import { SYSTEM_PREFIX } from './system-prefix';
import {
  graphWaiverLines,
  HUT_TABLE_WAIVER,
  PATH_DISTANCE_WAIVER,
  PORTAL_FOV_WAIVER,
} from './graph-waivers';

const ALL_WAIVERS = [
  PATH_DISTANCE_WAIVER,
  HUT_TABLE_WAIVER,
  PORTAL_FOV_WAIVER,
] as const;

/** Expected #60 waiver lines per IWER capture. `office_small` meets every rule. */
const EXPECTED: Record<IwerRoomId, readonly string[]> = {
  living_room: [HUT_TABLE_WAIVER, PORTAL_FOV_WAIVER],
  meeting_room: [PATH_DISTANCE_WAIVER],
  music_room: [HUT_TABLE_WAIVER],
  office_large: [HUT_TABLE_WAIVER],
  office_small: [],
};

function userMessageFor(id: IwerRoomId): {
  text: string;
  waivers: string[];
  keys: string[];
} {
  const text = buildUserMessage({
    graph: IWER_GRAPHS[id],
    seed: 'f1a2b3c4d5e6-2026-10-14',
    tier: 'easy',
  });
  const parsed = JSON.parse(text) as {
    waivers: string[];
  };
  return {
    text,
    waivers: parsed.waivers,
    keys: Object.keys(parsed),
  };
}

describe('graph waiver lines', () => {
  it('keeps SYSTEM_PREFIX free of per-graph waiver text', () => {
    for (const line of ALL_WAIVERS) {
      expect(SYSTEM_PREFIX).not.toContain(line);
    }
  });

  it.each([...IWER_ROOM_IDS])(
    'posts the right waiver lines for IWER %s',
    (id) => {
      const expected = [...EXPECTED[id]];
      expect(graphWaiverLines(IWER_GRAPHS[id])).toEqual(expected);

      const user = userMessageFor(id);
      expect(user.waivers).toEqual(expected);
      expect(user.keys.indexOf('waivers')).toBeLessThan(
        user.keys.indexOf('graph')
      );

      for (const line of ALL_WAIVERS) {
        if (expected.includes(line)) {
          expect(user.text).toContain(line);
        } else {
          expect(user.text).not.toContain(line);
        }
      }
    }
  );

  it('gives office_small no waiver lines', () => {
    expect(graphWaiverLines(IWER_GRAPHS.office_small)).toEqual([]);
    const user = userMessageFor('office_small');
    expect(user.waivers).toEqual([]);
    for (const line of ALL_WAIVERS) {
      expect(user.text).not.toContain(line);
    }
  });
});
