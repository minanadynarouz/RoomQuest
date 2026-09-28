import type { LevelPlan } from '@roomquest/schema';

/**
 * Valid level plan for the synthetic living room
 * Adapted from Design Doc §6 sample to use MVP piece IDs
 *
 * Flow:
 * 1. Start at village_hut on coffee table (s1)
 * 2. Build plank bridge from coffee table to couch (s2)
 * 3. Pull lever on side table (s4) to open gate on couch
 * 4. Cross to crystal_shrine on couch
 *
 * Tests:
 * - Player-built bridge
 * - Lever-gate linkage
 * - Multiple beats
 * - Valid dialogue
 */
export const SYNTHETIC_LIVING_ROOM_PLAN: LevelPlan = {
  seed: 'f1a2b3c4d5e6-2026-10-14',
  theme: 'forest',
  title: 'The Living Room Quest',
  start: 's1',
  goal: 's2',
  parTimeMs: 180000, // 3 minutes
  placements: [
    {
      id: 'p1',
      piece: 'village_hut',
      surface: 's1',
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p2',
      piece: 'plank_bridge',
      surface: 's1',
      to: 's2',
      u: 0.8,
      v: 0.5,
      playerBuilt: true,
      links: [],
    },
    {
      id: 'p3',
      piece: 'gate',
      surface: 's2',
      u: 0.3,
      v: 0.5,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p4',
      piece: 'lever',
      surface: 's4',
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: ['p3'],
    },
    {
      id: 'p5',
      piece: 'gem',
      surface: 's1',
      u: 0.2,
      v: 0.3,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p6',
      piece: 'gem',
      surface: 's2',
      u: 0.6,
      v: 0.7,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p7',
      piece: 'crystal_shrine',
      surface: 's2',
      u: 0.8,
      v: 0.5,
      playerBuilt: false,
      links: [],
    },
  ],
  beats: [
    {
      goal: 'Bridge the gap to the couch',
      uses: ['p2'],
    },
    {
      goal: 'Pull the lever to open the gate',
      uses: ['p4', 'p3'],
    },
    {
      goal: 'Reach the crystal shrine',
      uses: ['p7'],
    },
  ],
  dialogue: [
    {
      trigger: 'intro',
      line: 'The sun crystal has fallen onto the couch! Help me reach it.',
    },
    {
      trigger: 'beat',
      line: 'Great work on that bridge!',
    },
    {
      trigger: 'gaze',
      line: 'Look for a lever nearby to open gates.',
    },
    {
      trigger: 'win',
      line: 'You did it! The crystal is safe!',
    },
  ],
};
