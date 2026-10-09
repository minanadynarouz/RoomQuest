import type { LevelPlan } from '@roomquest/schema';

/**
 * X-08 test plan on the synthetic living-room graph.
 * Does not replace SYNTHETIC_LIVING_ROOM_PLAN (Backend-owned).
 *
 * Flow:
 * 1. Start at village_hut on coffee table (s1, 0.6 m² ≥ 0.5 m²)
 * 2. Stun the slime patrolling s1
 * 3. Cross the pre-built plank to the couch
 * 4. Reach the crystal shrine
 */
export const SYNTHETIC_SLIME_PLAN: LevelPlan = {
  seed: 'f1a2b3c4d5e6-2026-10-09-x08',
  theme: 'forest',
  title: 'The Squishy Scout',
  start: 's1',
  goal: 's2',
  parTimeMs: 180000,
  placements: [
    {
      id: 'p1',
      piece: 'village_hut',
      surface: 's1',
      u: 0.2,
      v: 0.5,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p8',
      piece: 'slime',
      surface: 's1',
      u: 0.62,
      v: 0.5,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p2',
      piece: 'plank_bridge',
      surface: 's1',
      to: 's2',
      u: 0.88,
      v: 0.5,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p7',
      piece: 'crystal_shrine',
      surface: 's2',
      u: 0.75,
      v: 0.5,
      playerBuilt: false,
      links: [],
    },
  ],
  beats: [
    { goal: 'Stun the slime so I can sneak past', uses: ['p8'] },
    { goal: 'Reach the crystal shrine', uses: ['p7'] },
  ],
  dialogue: [
    {
      trigger: 'intro',
      line: 'A squishy friend is blocking the path. Poke it gently!',
    },
    {
      trigger: 'stuck',
      line: 'Poke or far-pinch the slime to stun it for a few seconds.',
    },
    {
      trigger: 'beat',
      line: 'Nice poke! I can sneak by while it is dazzled.',
    },
    {
      trigger: 'gaze',
      line: 'A gentle poke or a ray pinch stuns the slime.',
    },
    {
      trigger: 'win',
      line: 'We made it past, and nobody got hurt!',
    },
  ],
};
