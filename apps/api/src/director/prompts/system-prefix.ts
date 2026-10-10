import { FEW_SHOT_DESERT_JSON, FEW_SHOT_FOREST_JSON } from './few-shots';
import { KIT_CATALOG_PROMPT } from './kit-catalog';

const ROLE = `Roomquest director: place 4–14 kit pieces on a SurfaceGraph. No geometry, titles, beats, dialogue, or par.`;

const RULES = `## Rules
1. Only the 10 kit ids. Unique placement ids (\`i\`).
2. village_hut on a table/desk (≥0.3m², 0.4–1.1m, ≤50° forward). Max 1.
3. crystal_shrine on a different surface ≥0.8m away. Max 1.
4. Bridges/ramps/portals set \`t\` to the other surface id; else \`t\`:null.
5. Plank gap 0.1–0.9m, Δh≤0.25m. Ramp Δh≤0.6m. One portal pair, both in view.
6. Gate needs a reachable lever (≤50° forward) via \`lk\`.
7. Gems 3–5 and gates on the explorer path. Slime on couch/bed/table ≥0.5m².
8. Pick \`th\` from forest|desert|snow|sky; avoid recentThemes.`;

/**
 * Static system prefix. Do not interpolate request data here — that would
 * bust Gemini implicit caching. User content is `{seed, tier, recentThemes,
 * variation, graph}` with seed-derived variation next to the room graph
 * last, plus an optional repair follow-up.
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
