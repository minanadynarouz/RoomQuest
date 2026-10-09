/**
 * `@roomquest/level-core` auto-repair (ticket B-04).
 *
 * Pure and isomorphic: the NestJS director and the Vite client both call
 * {@link repairPlan} on LLM output before falling back to generate.
 */

export { repairPlan } from './repair-plan';
export type { RepairResult } from './repair-plan';
