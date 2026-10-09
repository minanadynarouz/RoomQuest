import { generatePlan } from '@roomquest/level-core';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { describe, expect, it } from 'vitest';
import { makeDailySeed } from './daily-seed';

describe('makeDailySeed', () => {
  it('is roomHash-date and changes when the date changes', () => {
    expect(makeDailySeed('f1a2b3c4d5e6', '2026-10-14')).toBe(
      'f1a2b3c4d5e6-2026-10-14'
    );
    expect(makeDailySeed('f1a2b3c4d5e6', '2026-10-14')).not.toBe(
      makeDailySeed('f1a2b3c4d5e6', '2026-10-15')
    );
  });

  it('keeps generatePlan deterministic for a seed and different for the next date', () => {
    const roomHash = SYNTHETIC_LIVING_ROOM.roomHash;
    const seedA = makeDailySeed(roomHash, '2026-10-14');
    const seedB = makeDailySeed(roomHash, '2026-10-15');
    const a = generatePlan(SYNTHETIC_LIVING_ROOM, seedA, 'easy');
    const aAgain = generatePlan(SYNTHETIC_LIVING_ROOM, seedA, 'easy');
    const b = generatePlan(SYNTHETIC_LIVING_ROOM, seedB, 'easy');
    expect(a).toEqual(aAgain);
    expect(a).not.toEqual(b);
  });
});
