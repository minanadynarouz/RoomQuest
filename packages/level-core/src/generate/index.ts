/**
 * `@roomquest/level-core` procedural generator (ticket B-04).
 *
 * Seeded, isomorphic, and the client's instant fallback when the director
 * API is slow or down. Same `(graph, seed, tier)` always yields the same
 * {@link LevelPlan}.
 */

export { generatePlan, generatePlanResult } from './generate-plan';
export type { GeneratePlanOptions, GeneratePlanResult } from './generate-plan';
