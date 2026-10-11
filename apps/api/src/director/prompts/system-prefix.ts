import { VALIDATION_LIMITS } from '@roomquest/level-core';
import { KIT_CATALOG } from '@roomquest/schema';
import { FEW_SHOT_DESERT_JSON, FEW_SHOT_FOREST_JSON } from './few-shots';
import { KIT_CATALOG_PROMPT } from './kit-catalog';

const ROLE = `Roomquest director: place 4–14 kit pieces on a SurfaceGraph. No geometry, titles, beats, dialogue, or par.`;

const L = VALIDATION_LIMITS;
const m = (value: number): string => String(value);

/**
 * Numeric rules are interpolated once at module load from level-core's
 * VALIDATION_LIMITS (the values validatePlan enforces), never hard-coded,
 * so the string is byte-identical on every request.
 */
const RULES = `## Rules
1. Only the 10 kit ids. Unique placement ids (\`i\`).
2. village_hut on a table/desk (≥${m(KIT_CATALOG.village_hut.minArea ?? 0)}m², ${m(KIT_CATALOG.village_hut.minHeight ?? 0)}–${m(KIT_CATALOG.village_hut.maxHeight ?? 0)}m, ≤${m(L.maxSlopeDeg)}° from forward). Max 1.
3. crystal_shrine on a different surface ≥${m(L.minPathDistanceM)}m (min path distance) from the hut. Max 1.
4. Bridges/ramps/portals set \`t\` to the other surface id; else \`t\`:null.
5. Plank gap ${m(L.plankMinGapM)}–${m(L.plankMaxGapM)}m, step height Δh≤${m(L.plankMaxStepHeightM)}m. Ramp Δh≤${m(L.rampMaxStepHeightM)}m and min floor run ≥${m(L.rampFloorRunPerDh)}×Δh. One portal pair, both in view.
6. Max slope: any surface or \`t\` target used by hut, lever or portal must be ≤${m(L.maxSlopeDeg)}° from forward.
7. Reach: levers only on reach ${L.playerReach.join('|')} surfaces, within ${m(L.leverMaxReachM)}m. Gate needs such a lever via \`lk\`.
8. Gems 3–5 and gates on the explorer path. Slime on couch/bed/table ≥${m(KIT_CATALOG.slime.minArea ?? 0)}m².
9. Beats must be completable in order: every used piece exists, the explorer can reach it from the hut, a gate opens only after a reachable linked lever, goal reachable from start.
10. Pick \`th\` from forest|desert|snow|sky; avoid recentThemes.
11. If the response schema has \`slot\` instead of \`s\`/\`u\`/\`v\`, pick one slot id from the graph node \`slots\` whose \`fits\` lists the piece; each slot at most once.`;

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
