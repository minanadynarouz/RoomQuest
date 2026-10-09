/**
 * Two short few-shot plans in LevelPlanLLM shape (all fields required,
 * `to` is string | null). Serialised once at module load so the system
 * prefix stays byte-stable.
 */

const FOREST_LIVING_ROOM = {
  seed: 'f1a2b3c4d5e6-2026-10-14',
  theme: 'forest',
  title: 'The Living Room Quest',
  start: 's1',
  goal: 's2',
  parTimeMs: 180000,
  placements: [
    {
      id: 'p1',
      piece: 'village_hut',
      surface: 's1',
      to: null,
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
      to: null,
      u: 0.3,
      v: 0.5,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p4',
      piece: 'lever',
      surface: 's4',
      to: null,
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: ['p3'],
    },
    {
      id: 'p5',
      piece: 'gem',
      surface: 's1',
      to: null,
      u: 0.2,
      v: 0.3,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p6',
      piece: 'gem',
      surface: 's2',
      to: null,
      u: 0.6,
      v: 0.7,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p7',
      piece: 'crystal_shrine',
      surface: 's2',
      to: null,
      u: 0.8,
      v: 0.5,
      playerBuilt: false,
      links: [],
    },
  ],
  beats: [
    { goal: 'Bridge the gap to the couch', uses: ['p2'] },
    { goal: 'Pull the lever to open the gate', uses: ['p4', 'p3'] },
    { goal: 'Reach the crystal shrine', uses: ['p7'] },
  ],
  dialogue: [
    {
      trigger: 'intro',
      line: 'The sun crystal has fallen onto the couch! Help me reach it.',
    },
    { trigger: 'beat', line: 'Great work on that bridge!' },
    { trigger: 'win', line: 'You did it! The crystal is safe!' },
  ],
} as const;

const DESERT_DESK_QUEST = {
  seed: 'a9b8c7d6e5f4-2026-10-15',
  theme: 'desert',
  title: 'Shrine Across the Desk',
  start: 's1',
  goal: 's3',
  parTimeMs: 120000,
  placements: [
    {
      id: 'p1',
      piece: 'village_hut',
      surface: 's1',
      to: null,
      u: 0.4,
      v: 0.5,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p2',
      piece: 'ramp',
      surface: 's1',
      to: 's3',
      u: 0.9,
      v: 0.5,
      playerBuilt: true,
      links: [],
    },
    {
      id: 'p3',
      piece: 'gem',
      surface: 's1',
      to: null,
      u: 0.2,
      v: 0.2,
      playerBuilt: false,
      links: [],
    },
    {
      id: 'p4',
      piece: 'crystal_shrine',
      surface: 's3',
      to: null,
      u: 0.6,
      v: 0.5,
      playerBuilt: false,
      links: [],
    },
  ],
  beats: [
    { goal: 'Place the ramp to the far desk', uses: ['p2'] },
    { goal: 'Reach the desert shrine', uses: ['p4'] },
  ],
  dialogue: [
    {
      trigger: 'intro',
      line: 'The shrine sits on that far desk. A ramp will get me there.',
    },
    { trigger: 'win', line: 'Sand and sparkle — we made it!' },
  ],
} as const;

export const FEW_SHOT_FOREST_JSON: string = JSON.stringify(FOREST_LIVING_ROOM);
export const FEW_SHOT_DESERT_JSON: string = JSON.stringify(DESERT_DESK_QUEST);
