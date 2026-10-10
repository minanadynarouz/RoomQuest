/**
 * Two short few-shot plans in compact LevelPlanLLM shape (th + pl only).
 * Serialised once at module load so the system prefix stays byte-stable.
 */

const FOREST_LIVING_ROOM = {
  th: 'forest',
  pl: [
    { i: 'p1', pc: 'village_hut', s: 's1', t: null, u: 0.5, v: 0.5, lk: [] },
    { i: 'p2', pc: 'plank_bridge', s: 's1', t: 's2', u: 0.8, v: 0.5, lk: [] },
    { i: 'p3', pc: 'gate', s: 's2', t: null, u: 0.3, v: 0.5, lk: [] },
    { i: 'p4', pc: 'lever', s: 's4', t: null, u: 0.5, v: 0.5, lk: ['p3'] },
    { i: 'p5', pc: 'gem', s: 's1', t: null, u: 0.2, v: 0.3, lk: [] },
    { i: 'p6', pc: 'gem', s: 's2', t: null, u: 0.6, v: 0.7, lk: [] },
    { i: 'p7', pc: 'crystal_shrine', s: 's2', t: null, u: 0.8, v: 0.5, lk: [] },
  ],
} as const;

const DESERT_DESK_QUEST = {
  th: 'desert',
  pl: [
    { i: 'p1', pc: 'village_hut', s: 's1', t: null, u: 0.4, v: 0.5, lk: [] },
    { i: 'p2', pc: 'ramp', s: 's1', t: 's3', u: 0.9, v: 0.5, lk: [] },
    { i: 'p3', pc: 'gem', s: 's1', t: null, u: 0.2, v: 0.2, lk: [] },
    { i: 'p4', pc: 'crystal_shrine', s: 's3', t: null, u: 0.6, v: 0.5, lk: [] },
  ],
} as const;

export const FEW_SHOT_FOREST_JSON: string = JSON.stringify(FOREST_LIVING_ROOM);
export const FEW_SHOT_DESERT_JSON: string = JSON.stringify(DESERT_DESK_QUEST);
