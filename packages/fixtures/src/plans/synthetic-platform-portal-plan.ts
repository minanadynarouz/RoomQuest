import type { LevelPlan } from '@roomquest/schema';

/**
 * X-07 test plan on the synthetic living-room graph.
 * Does not replace SYNTHETIC_LIVING_ROOM_PLAN (Backend-owned).
 *
 * Flow:
 * 1. Start at village_hut on coffee table (s1)
 * 2. Drag the moving platform on s1 until aligned, ride it to the desk (s3)
 * 3. Take the portal pair from the desk (s3) to the couch (s2)
 * 4. Reach the crystal shrine on the couch
 */
export const SYNTHETIC_PLATFORM_PORTAL_PLAN: LevelPlan = {
  seed: 'f1a2b3c4d5e6-2026-10-09-x07',
  theme: 'sky',
  title: 'Rails and Rings',
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
      id: 'p2',
      piece: 'moving_platform',
      surface: 's1',
      to: 's3',
      u: 0.5,
      v: 0.85,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p3',
      piece: 'portal',
      surface: 's3',
      to: 's2',
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: ['p4'],
    },
    {
      id: 'p4',
      piece: 'portal',
      surface: 's2',
      to: 's3',
      u: 0.2,
      v: 0.5,
      playerBuilt: false,
      links: ['p3'],
    },
    {
      id: 'p5',
      piece: 'gem',
      surface: 's1',
      u: 0.35,
      v: 0.35,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p6',
      piece: 'gem',
      surface: 's3',
      u: 0.3,
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
    { goal: 'Slide the platform over and hop on', uses: ['p2'] },
    { goal: 'Step through the portal', uses: ['p3'] },
    { goal: 'Reach the crystal shrine', uses: ['p7'] },
  ],
  dialogue: [
    {
      trigger: 'intro',
      line: 'Drag that platform to me, then I can ride across.',
    },
    {
      trigger: 'stuck',
      line: 'The platform is not lined up. Slide it along the rail.',
    },
    {
      trigger: 'beat',
      line: 'The ring will take me the rest of the way.',
    },
    {
      trigger: 'gaze',
      line: 'Pinch the platform and drag it along the rail.',
    },
    {
      trigger: 'win',
      line: 'What a ride! The crystal is safe.',
    },
  ],
};
