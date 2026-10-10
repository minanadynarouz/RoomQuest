import {
  LevelPlan,
  PAR_TIME_MAX_MS,
  PAR_TIME_MIN_MS,
  SurfaceGraph,
} from '@roomquest/schema';
import { clampParTimeMs } from './clamp-par';
import { checkConstraints } from './constraints';
import { relaxedRulesFor } from './relaxed-rules';
import { checkSolvability } from './solvability';
import { issue, type Issue, type ValidationResult } from './types';

/**
 * Validate a {@link LevelPlan} against a {@link SurfaceGraph}.
 *
 * Pure and isomorphic: safe to call from the Vite client bundle and from
 * the NestJS director. The client director (`apps/client/src/game/director/`)
 * will replace its local graph check with this function — keep the signature
 * and `Issue.code` strings stable.
 *
 * Checks, in order:
 * 1. `parTimeMs` range (reports `PAR_OUT_OF_RANGE` only when the given
 *    value was not already clamped via {@link clampParTimeMs})
 * 2. Zod parse of plan and graph (`SCHEMA_INVALID`)
 * 3. Per-piece KIT_CATALOG constraints against the graph (surface exists,
 *    label / height / area / gap / reach / ≤ 50° FoV)
 * 4. BFS solvability: adjacent + ramps + portals + player-built bridges
 *    (assumed built); gates open only if a linked lever is hand- or
 *    ray-reachable; goal reachable from start; beats completable in order
 *
 * All issues are collected (no fail-fast) so a repair LLM call sees the
 * full list.
 *
 * @param plan - Normalised level plan (or a close structural stand-in)
 * @param graph - Room surface graph the plan is placed on
 */
export function validatePlan(
  plan: LevelPlan,
  graph: SurfaceGraph
): ValidationResult {
  const issues: Issue[] = [];
  const planUnknown: unknown = plan;

  checkParTime(planUnknown, issues);

  const planForParse = coercePlanForParse(planUnknown);
  const parsedPlan = LevelPlan.safeParse(planForParse);
  const parsedGraph = SurfaceGraph.safeParse(graph);

  if (!parsedPlan.success) {
    pushZodIssues(issues, parsedPlan.error.issues, 'plan');
  }
  if (!parsedGraph.success) {
    pushZodIssues(issues, parsedGraph.error.issues, 'graph');
  }

  if (!parsedPlan.success || !parsedGraph.success) {
    return {
      ok: false,
      issues,
      relaxed: parsedGraph.success ? relaxedRulesFor(parsedGraph.data) : [],
    };
  }

  checkConstraints(parsedPlan.data, parsedGraph.data, issues);
  checkSolvability(parsedPlan.data, parsedGraph.data, issues);

  return {
    ok: issues.length === 0,
    issues,
    relaxed: relaxedRulesFor(parsedGraph.data),
  };
}

function checkParTime(plan: unknown, issues: Issue[]): void {
  if (typeof plan !== 'object' || plan === null) {
    return;
  }
  const raw: unknown = (plan as { parTimeMs?: unknown }).parTimeMs;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return;
  }
  const inRange = raw >= PAR_TIME_MIN_MS && raw <= PAR_TIME_MAX_MS;
  const isInt = Number.isInteger(raw);
  if (inRange && isInt) {
    return;
  }
  issues.push(
    issue(
      'PAR_OUT_OF_RANGE',
      `parTimeMs ${String(raw)} is outside integer range ${String(PAR_TIME_MIN_MS)}..${String(PAR_TIME_MAX_MS)} (clamp before LevelPlan.parse)`
    )
  );
}

/**
 * Substitute a clamped par so remaining schema/constraint checks can run
 * after an out-of-range LLM value. Does not hide `PAR_OUT_OF_RANGE`.
 */
function coercePlanForParse(plan: unknown): unknown {
  if (typeof plan !== 'object' || plan === null) {
    return plan;
  }
  const raw = (plan as { parTimeMs?: unknown }).parTimeMs;
  if (typeof raw !== 'number') {
    return plan;
  }
  return { ...plan, parTimeMs: clampParTimeMs(raw) };
}

function pushZodIssues(
  issues: Issue[],
  zodIssues: readonly { path: readonly PropertyKey[]; message: string }[],
  prefix: 'plan' | 'graph'
): void {
  for (const zIssue of zodIssues) {
    const path = zIssue.path.map(String).join('.');
    const where = path.length > 0 ? `${prefix}.${path}` : prefix;
    issues.push(issue('SCHEMA_INVALID', `${where}: ${zIssue.message}`));
  }
}
