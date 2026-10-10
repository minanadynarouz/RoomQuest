import {
  BEAT_COMPLETABILITY,
  MAX_VIEW_ANGLE_DEG,
  MIN_PATH_DISTANCE_M,
  RAMP_FLOOR_RUN_FACTOR,
} from '@roomquest/level-core';
import { KIT_CATALOG } from '@roomquest/schema';
import { FEW_SHOT_DESERT_JSON, FEW_SHOT_FOREST_JSON } from './few-shots';
import { KIT_CATALOG_PROMPT } from './kit-catalog';

const hut = KIT_CATALOG.village_hut;
const shrine = KIT_CATALOG.crystal_shrine;
const plank = KIT_CATALOG.plank_bridge;
const ramp = KIT_CATALOG.ramp;
const lever = KIT_CATALOG.lever;
const slime = KIT_CATALOG.slime;
const portal = KIT_CATALOG.portal;

const MAX_REACH_M = lever.maxReachDistance ?? 0.7;
const MAX_STEP_HEIGHT_M = plank.maxDeltaHeight ?? 0.25;
const MAX_SLOPE_DEG = MAX_VIEW_ANGLE_DEG;
const RAMP_MAX_DH_M = ramp.maxDeltaHeight ?? 0.6;
const HUT_MIN_AREA = hut.minArea ?? 0.3;
const HUT_MIN_H = hut.minHeight ?? 0.4;
const HUT_MAX_H = hut.maxHeight ?? 1.1;
const HUT_MAX_ANGLE = hut.maxAngleFromForward ?? MAX_SLOPE_DEG;
const PLANK_MIN_GAP = plank.minGap ?? 0.1;
const PLANK_MAX_GAP = plank.maxGap ?? 0.9;
const SLIME_MIN_AREA = slime.minArea ?? 0.5;
const BEAT_REACH = BEAT_COMPLETABILITY.explorerMustReach.join('/');

const ROLE = `Roomquest director: place 4–14 kit pieces on a SurfaceGraph. No geometry, titles, beats, dialogue, or par.`;

const RULES = `## Rules
1. Only the 10 kit ids. Unique placement ids (\`i\`).
2. village_hut on a table/desk (≥${String(HUT_MIN_AREA)}m², ${String(HUT_MIN_H)}–${String(HUT_MAX_H)}m, ≤${String(HUT_MAX_ANGLE)}° forward). Max ${String(hut.maxPerLevel ?? 1)}.
3. crystal_shrine on a different surface ≥${String(MIN_PATH_DISTANCE_M)}m away. Max ${String(shrine.maxPerLevel ?? 1)}.
4. Bridges/ramps/portals set \`t\` to the other surface id; else \`t\`:null.
5. Plank gap ${String(PLANK_MIN_GAP)}–${String(PLANK_MAX_GAP)}m, Δh≤${String(MAX_STEP_HEIGHT_M)}m. Ramp Δh≤${String(RAMP_MAX_DH_M)}m. One portal pair, both in view (≤${String(portal.maxAngleFromForward ?? MAX_SLOPE_DEG)}°).
6. Gate needs a reachable lever (≤${String(lever.maxAngleFromForward ?? MAX_SLOPE_DEG)}° forward, max reach ${String(MAX_REACH_M)}m, hand|ray) via \`lk\`.
7. Gems and gates on the explorer path. Slime on couch/bed/table ≥${String(SLIME_MIN_AREA)}m².
8. Pick \`th\` from forest|desert|snow|sky; avoid recentThemes.
9. Numeric limits (from level-core / KIT_CATALOG): max reach ${String(MAX_REACH_M)}m, max step height ${String(MAX_STEP_HEIGHT_M)}m, max slope ${String(MAX_SLOPE_DEG)}°, minimum floor run ${String(RAMP_FLOOR_RUN_FACTOR)}×|Δh|.
10. Beat completability: beats in order; lever must be ${BEAT_COMPLETABILITY.leverReach} before its gate opens; explorer must reach ${BEAT_REACH} used by a beat. \`lk\` is lever→gate (and reserved for upcoming route \`links\` hints).`;

/**
 * Static system prefix. Do not interpolate request data here — that would
 * bust Gemini implicit caching. User content is `{seed, tier, recentThemes,
 * variation, waivers, graph}` with seed-derived variation and graph-capacity
 * waiver lines next to the room graph last, plus an optional repair follow-up.
 */
export const SYSTEM_PREFIX: string = [
  ROLE,
  RULES,
  '## Kit catalog',
  KIT_CATALOG_PROMPT,
  '## Few-shot 1',
  FEW_SHOT_FOREST_JSON,
  '## Few-shot 2',
  FEW_SHOT_DESERT_JSON,
].join('\n\n');
