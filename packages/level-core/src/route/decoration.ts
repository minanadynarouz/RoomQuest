import {
  DECORATION_LINE_MAX_CHARS,
  DECORATION_MAX_LINES,
  Theme,
  type LevelDecorationLLM,
  type LevelPlan,
  type SurfaceGraph,
} from '@roomquest/schema';
import { buildDialogue, pickTitle } from '../generate/dialogue';
import { LABEL_WORD } from '../generate/generate-plan';
import { createRng } from '../generate/prng';
import { indexNodes } from '../validate/graph-utils';
import { validatePlan } from '../validate/validate-plan';
import {
  HAZARD_TYPES,
  withHazard,
  type CandidateRoute,
  type HazardType,
} from './candidates';

/**
 * What Gemini returns for a hybrid route: the @roomquest/schema
 * decoration shape. `buildLevelDecorationSchema` narrows the same fields
 * to per-request string enums; its output is assignable to this type.
 * Re-exported under the old name for compatibility.
 */
export type LevelDecoration = LevelDecorationLLM;

/** Explorer line for a beat, kept next to (not inside) the LevelPlan. */
export interface DecorationLine {
  beat: string;
  text: string;
}

export type ApplyDecorationResult =
  | {
      ok: true;
      plan: LevelPlan;
      lines: DecorationLine[];
      /** Human-readable notes for every option replaced by a default. */
      replaced: string[];
    }
  | { ok: false; error: 'UNKNOWN_ROUTE_ID'; routeId: string };

/** Aliases of the schema limits (single source: @roomquest/schema). */
export const MAX_DECORATION_LINES = DECORATION_MAX_LINES;
export const MAX_DECORATION_LINE_CHARS = DECORATION_LINE_MAX_CHARS;
const TWIST_PREFIX = 'Twist: ';

/**
 * Apply a Gemini decoration to one of the offered routes. Only an
 * unknown `routeId` is rejected; an un-offered twist or hazard is
 * replaced by a deterministic default (first offered twist beat; first
 * offered hazard type for that beat, or none) so the plan always passes
 * validatePlan. Lines never fail the plan.
 */
export function applyDecoration(
  routes: CandidateRoute | readonly CandidateRoute[],
  decoration: LevelDecoration
): ApplyDecorationResult {
  const list: readonly CandidateRoute[] = Array.isArray(routes)
    ? (routes as readonly CandidateRoute[])
    : [routes as CandidateRoute];
  const route = list.find((r) => r.id === decoration.routeId);
  if (!route) {
    return { ok: false, error: 'UNKNOWN_ROUTE_ID', routeId: decoration.routeId };
  }
  const graph = route.graph;
  const replaced: string[] = [];
  let plan: LevelPlan = structuredClone(route.plan);

  const theme = Theme.safeParse(decoration.theme);
  if (theme.success && theme.data !== plan.theme) {
    plan = retheme(plan, theme.data, graph);
  } else if (!theme.success) {
    replaced.push(`theme "${decoration.theme}" → ${plan.theme}`);
  }

  const seenBeats = new Set<string>();
  for (const hazard of decoration.hazards) {
    if (seenBeats.has(hazard.beat)) {
      replaced.push(`extra hazard on beat ${hazard.beat} dropped`);
      continue;
    }
    seenBeats.add(hazard.beat);
    const offered = route.options.hazards.find((h) => h.beat === hazard.beat);
    if (!offered) {
      replaced.push(`hazard on beat ${hazard.beat} not offered → none`);
      continue;
    }
    const wanted = offered.types.find((t) => t === hazard.type);
    const order: HazardType[] = wanted
      ? [wanted, ...offered.types.filter((t) => t !== wanted)]
      : [...offered.types];
    if (!wanted) {
      replaced.push(`hazard "${hazard.type}" on beat ${hazard.beat} not offered`);
    }
    const next = firstValidHazard(plan, graph, Number(hazard.beat), order);
    if (next) {
      plan = next.plan;
      if (wanted && next.type !== wanted) {
        replaced.push(`hazard ${wanted} on beat ${hazard.beat} → ${next.type}`);
      }
    } else {
      replaced.push(`hazard on beat ${hazard.beat} → none (combination)`);
    }
  }

  const twist = route.options.twistBeats.includes(decoration.twistBeat)
    ? decoration.twistBeat
    : (route.options.twistBeats[0] ?? '0');
  if (twist !== decoration.twistBeat) {
    replaced.push(`twistBeat "${decoration.twistBeat}" → ${twist}`);
  }
  const twisted = withTwist(plan, Number(twist));
  if (validatePlan(twisted, graph).ok) {
    plan = twisted;
  }

  return {
    ok: true,
    plan,
    lines: sanitizeDecorationLines(decoration.lines, plan.beats.length),
    replaced,
  };
}

function firstValidHazard(
  plan: LevelPlan,
  graph: SurfaceGraph,
  beat: number,
  order: readonly HazardType[]
): { plan: LevelPlan; type: HazardType } | null {
  for (const type of order) {
    if (!HAZARD_TYPES.includes(type)) {
      continue;
    }
    const next = withHazard(plan, graph, beat, type);
    if (next) {
      return { plan: next, type };
    }
  }
  return null;
}

function withTwist(plan: LevelPlan, index: number): LevelPlan {
  return {
    ...plan,
    beats: plan.beats.map((beat, i) =>
      i === index && !beat.goal.startsWith(TWIST_PREFIX)
        ? { ...beat, goal: `${TWIST_PREFIX}${beat.goal}`.slice(0, 80) }
        : beat
    ),
  };
}

function retheme(
  plan: LevelPlan,
  theme: Theme,
  graph: SurfaceGraph
): LevelPlan {
  const nodes = indexNodes(graph);
  const rng = createRng(`${plan.seed}|${theme}|decoration`);
  const start = nodes.get(plan.start);
  const goal = nodes.get(plan.goal);
  return {
    ...plan,
    theme,
    title: pickTitle(theme, rng),
    dialogue: buildDialogue(theme, rng, {
      startLabel: start ? LABEL_WORD[start.label] : 'table',
      goalLabel: goal ? LABEL_WORD[goal.label] : 'far surface',
    }),
  };
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Lines cleanup: control characters stripped, trimmed, cut to 80 chars,
 * one per known beat (first wins), at most 8. A line is dropped only
 * when it is empty or names no beat of the plan.
 */
export function sanitizeDecorationLines(
  lines: readonly { beat: string; text: string }[] | undefined,
  beatCount: number
): DecorationLine[] {
  const out: DecorationLine[] = [];
  const used = new Set<string>();
  for (const line of lines ?? []) {
    if (out.length >= MAX_DECORATION_LINES) {
      break;
    }
    if (typeof line.text !== 'string' || typeof line.beat !== 'string') {
      continue;
    }
    const beat = line.beat.trim();
    const n = Number(beat);
    if (!/^\d+$/.test(beat) || n >= beatCount || used.has(String(n))) {
      continue;
    }
    const text = line.text
      .replace(CONTROL_CHARS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_DECORATION_LINE_CHARS)
      .trim();
    if (text.length === 0) {
      continue;
    }
    used.add(String(n));
    out.push({ beat: String(n), text });
  }
  return out;
}
