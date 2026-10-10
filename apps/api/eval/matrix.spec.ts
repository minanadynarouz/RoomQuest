import { describe, expect, it } from 'vitest';
import { pickRoundRobin, spreadEvalCells } from './matrix';

describe('spreadEvalCells', () => {
  it('cycles each dimension independently, never nested cartesian order', () => {
    const cells = spreadEvalCells(
      4,
      ['living_room', 'meeting_room'],
      ['easy', 'normal'] as const,
      ['2026-10-01', '2026-10-02'],
      ['uv'] as const
    );
    expect(
      cells.map((cell) => `${cell.room}:${cell.tier}:${cell.date}`)
    ).toEqual([
      'living_room:easy:2026-10-01',
      'meeting_room:normal:2026-10-02',
      'living_room:easy:2026-10-01',
      'meeting_room:normal:2026-10-02',
    ]);
    expect(cells.map((cell) => cell.room)).not.toEqual([
      'living_room',
      'living_room',
      'living_room',
      'living_room',
    ]);
  });

  it('includes placement arms in the same round-robin', () => {
    const cells = spreadEvalCells(
      4,
      ['living_room'],
      ['easy'] as const,
      ['2026-10-01'],
      ['uv', 'slot'] as const
    );
    expect(cells.map((cell) => cell.placement)).toEqual([
      'uv',
      'slot',
      'uv',
      'slot',
    ]);
  });

  it('rejects an empty dimension', () => {
    expect(() => pickRoundRobin(0, [])).toThrow(/empty/);
  });
});
