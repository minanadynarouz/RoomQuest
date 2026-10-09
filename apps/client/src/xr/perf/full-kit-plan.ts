import { SYNTHETIC_LIVING_ROOM_PLAN } from '@roomquest/fixtures';
import type { LevelPlan, Placement } from '@roomquest/schema';
import { PIECE_IDS } from '@roomquest/schema';

/**
 * One placement of every PIECE_IDS entry on the synthetic living-room graph.
 * Used for the X-03 14-piece draw-call budget and the X-10 room table.
 * Does not replace SYNTHETIC_LIVING_ROOM_PLAN.
 */
export function fullKitPlan(): LevelPlan {
  const extras: Placement[] = [
    {
      id: 'p8',
      piece: 'ramp',
      surface: 's1',
      to: 's5',
      u: 0.2,
      v: 0.8,
      playerBuilt: true,
      links: [],
    },
    {
      id: 'p9',
      piece: 'moving_platform',
      surface: 's5',
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p10',
      piece: 'slime',
      surface: 's2',
      u: 0.2,
      v: 0.2,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p11',
      piece: 'portal',
      surface: 's1',
      to: 's3',
      u: 0.1,
      v: 0.5,
      playerBuilt: false,
      links: ['p12'],
    },
    {
      id: 'p12',
      piece: 'portal',
      surface: 's3',
      to: 's1',
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: ['p11'],
    },
    {
      id: 'p13',
      piece: 'gem',
      surface: 's4',
      u: 0.5,
      v: 0.2,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p14',
      piece: 'gem',
      surface: 's5',
      u: 0.3,
      v: 0.3,
      playerBuilt: false,
      links: [],
    },
  ];

  return {
    ...SYNTHETIC_LIVING_ROOM_PLAN,
    title: 'Fourteen Piece Budget',
    placements: [...SYNTHETIC_LIVING_ROOM_PLAN.placements, ...extras],
  };
}

export function fullKitUsesEveryPiece(
  plan: LevelPlan = fullKitPlan()
): boolean {
  const used = new Set(plan.placements.map((placement) => placement.piece));
  for (const id of PIECE_IDS) {
    if (!used.has(id)) return false;
  }
  return true;
}
