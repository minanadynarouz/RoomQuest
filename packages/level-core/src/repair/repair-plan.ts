import {
  isPieceId,
  KIT_CATALOG,
  LevelPlan,
  PAR_TIME_MIN_MS,
  type Placement,
  type SurfaceGraph,
  type SurfaceNode,
} from '@roomquest/schema';
import { clampParTimeMs } from '../validate/clamp-par';
import {
  bfsReachable,
  explorerAdjacency,
  findEdge,
  GEOM_EPS_M,
  indexNodes,
  isPlayerReachable,
  pairMetrics,
} from '../validate/graph-utils';
import type { IssueCode, ValidationResult } from '../validate/types';
import { validatePlan } from '../validate/validate-plan';

/**
 * Result of {@link repairPlan}. `repairs` is copied into
 * `LevelResponse.repairs` by the director API.
 */
export interface RepairResult {
  plan: LevelPlan;
  repairs: string[];
  result: ValidationResult;
}

const DROP_CODES: ReadonlySet<IssueCode> = new Set([
  'UNKNOWN_SURFACE',
  'LABEL_NOT_ALLOWED',
  'HEIGHT_OUT_OF_RANGE',
  'AREA_TOO_SMALL',
  'GAP_TOO_WIDE',
  'GAP_TOO_NARROW',
  'DELTA_HEIGHT_TOO_LARGE',
  'FLOOR_RUN_TOO_SHORT',
  'OUT_OF_REACH',
  'SLOPE_TOO_STEEP',
  'MISSING_SECOND_SURFACE',
  'SAME_SURFACE_PAIR',
  'GATE_WITHOUT_LEVER',
  'INVALID_LINK',
  'NOT_ON_PATH',
  'DUPLICATE_PLACEMENT_ID',
]);

const LINK_PIECES = new Set(['plank_bridge', 'ramp', 'portal']);

/**
 * Auto-repair a level plan against a surface graph (design doc §6 step 4).
 *
 * 1. Clamp each placement's u/v into `[0, 1]`
 * 2. Drop pieces that fail per-piece / path constraints
 * 3. Insert a plank where a legal gap can restore reachability
 * 4. Clamp `parTimeMs` via {@link clampParTimeMs}
 * 5. Re-run {@link validatePlan}
 *
 * Pure and isomorphic. Never throws on bad input — a stub plan is returned
 * and `result.ok` is false.
 */
export function repairPlan(plan: LevelPlan, graph: SurfaceGraph): RepairResult {
  try {
    return repairPlanInner(plan, graph);
  } catch {
    const fallback = emptyPlan();
    return {
      plan: fallback,
      repairs: ['gave up on unrecoverable input'],
      result: safeValidate(fallback, graph),
    };
  }
}

function repairPlanInner(plan: LevelPlan, graph: SurfaceGraph): RepairResult {
  const repairs: string[] = [];
  let next = coercePlan(plan, repairs);

  next = clampUv(next, repairs);
  next = clampPar(next, repairs);
  next = dropInvalid(next, graph, repairs);
  next = insertPlanks(next, graph, repairs);
  next = pruneRefs(next);

  const result = safeValidate(next, graph);
  return { plan: next, repairs, result };
}

function safeValidate(plan: LevelPlan, graph: SurfaceGraph): ValidationResult {
  try {
    return validatePlan(plan, graph);
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: 'SCHEMA_INVALID',
          message: 'validatePlan threw on repaired input',
        },
      ],
    };
  }
}

function emptyPlan(): LevelPlan {
  return {
    seed: 'repair',
    theme: 'forest',
    title: 'Unrepaired',
    start: 's1',
    goal: 's2',
    placements: [
      stubPlacement('p1', 'village_hut', 's1'),
      stubPlacement('p2', 'crystal_shrine', 's2'),
      stubPlacement('p3', 'gem', 's1'),
      stubPlacement('p4', 'gem', 's2'),
    ],
    beats: [
      { goal: 'Repair failed', uses: ['p3'] },
      { goal: 'Repair failed', uses: ['p4'] },
    ],
    dialogue: [],
    parTimeMs: PAR_TIME_MIN_MS,
  };
}

function stubPlacement(
  id: string,
  piece: Placement['piece'],
  surface: string
): Placement {
  return {
    id,
    piece,
    surface,
    u: 0.5,
    v: 0.5,
    playerBuilt: false,
    links: [],
  };
}

function coercePlan(input: unknown, repairs: string[]): LevelPlan {
  if (typeof input !== 'object' || input === null) {
    repairs.push('replaced non-object plan with a stub');
    return emptyPlan();
  }
  const rec = input as Record<string, unknown>;
  const parsed = LevelPlan.safeParse(input);
  if (parsed.success) {
    return clonePlan(parsed.data);
  }

  const placements = Array.isArray(rec.placements)
    ? rec.placements.flatMap((item, index) => {
        const placement = coercePlacement(item, index);
        if (placement) {
          return [placement];
        }
        repairs.push(`dropped unparseable placement at index ${String(index)}`);
        return [];
      })
    : [];

  const theme =
    rec.theme === 'forest' ||
    rec.theme === 'desert' ||
    rec.theme === 'snow' ||
    rec.theme === 'sky'
      ? rec.theme
      : 'forest';

  return {
    seed: typeof rec.seed === 'string' ? rec.seed : 'repair',
    theme,
    title: clampText(typeof rec.title === 'string' ? rec.title : 'Repaired', 40),
    start: typeof rec.start === 'string' ? rec.start : 's1',
    goal: typeof rec.goal === 'string' ? rec.goal : 's2',
    placements,
    beats: Array.isArray(rec.beats)
      ? rec.beats.flatMap((beat) => coerceBeat(beat))
      : [],
    dialogue: Array.isArray(rec.dialogue)
      ? rec.dialogue.flatMap((line) => coerceDialogue(line)).slice(0, 12)
      : [],
    parTimeMs:
      typeof rec.parTimeMs === 'number' ? rec.parTimeMs : PAR_TIME_MIN_MS,
  };
}

function clonePlan(plan: LevelPlan): LevelPlan {
  return {
    ...plan,
    placements: plan.placements.map((placement) => ({
      ...placement,
      links: [...placement.links],
    })),
    beats: plan.beats.map((beat) => ({
      ...beat,
      uses: [...beat.uses],
    })),
    dialogue: plan.dialogue.map((line) => ({ ...line })),
  };
}

function coercePlacement(input: unknown, index: number): Placement | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }
  const rec = input as Record<string, unknown>;
  if (typeof rec.piece !== 'string' || !isPieceId(rec.piece)) {
    return null;
  }
  const id = typeof rec.id === 'string' && rec.id.length > 0 ? rec.id : `p${String(index + 1)}`;
  const surface = typeof rec.surface === 'string' ? rec.surface : '';
  if (surface.length === 0) {
    return null;
  }
  const placement: Placement = {
    id,
    piece: rec.piece,
    surface,
    u: 0.5,
    v: 0.5,
    playerBuilt: rec.playerBuilt === true,
    links: Array.isArray(rec.links)
      ? rec.links.filter((link): link is string => typeof link === 'string')
      : [],
  };
  if (typeof rec.u === 'number') {
    placement.u = rec.u;
  }
  if (typeof rec.v === 'number') {
    placement.v = rec.v;
  }
  if (typeof rec.to === 'string') {
    placement.to = rec.to;
  }
  return placement;
}

function coerceBeat(
  input: unknown
): { goal: string; uses: string[] }[] {
  if (typeof input !== 'object' || input === null) {
    return [];
  }
  const rec = input as Record<string, unknown>;
  const goal = clampText(
    typeof rec.goal === 'string' ? rec.goal : 'Continue',
    80
  );
  const uses = Array.isArray(rec.uses)
    ? rec.uses.filter((id): id is string => typeof id === 'string')
    : [];
  return [{ goal, uses }];
}

function coerceDialogue(
  input: unknown
): { trigger: 'intro' | 'beat' | 'stuck' | 'win' | 'gaze'; line: string }[] {
  if (typeof input !== 'object' || input === null) {
    return [];
  }
  const rec = input as Record<string, unknown>;
  const trigger = rec.trigger;
  if (
    trigger !== 'intro' &&
    trigger !== 'beat' &&
    trigger !== 'stuck' &&
    trigger !== 'win' &&
    trigger !== 'gaze'
  ) {
    return [];
  }
  const line = clampText(
    typeof rec.line === 'string' ? rec.line : '...',
    90
  );
  return [{ trigger, line }];
}

function clampText(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max);
}

function clampUv(plan: LevelPlan, repairs: string[]): LevelPlan {
  const placements = plan.placements.map((placement) => {
    const u = clamp01(placement.u);
    const v = clamp01(placement.v);
    if (u === placement.u && v === placement.v) {
      return placement;
    }
    repairs.push(`clamped u/v on ${placement.id} into 0..1`);
    return { ...placement, u, v };
  });
  return { ...plan, placements };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function clampPar(plan: LevelPlan, repairs: string[]): LevelPlan {
  const clamped = clampParTimeMs(plan.parTimeMs);
  if (clamped === plan.parTimeMs) {
    return plan;
  }
  repairs.push(`clamped parTimeMs to ${String(clamped)}`);
  return { ...plan, parTimeMs: clamped };
}

function dropInvalid(
  plan: LevelPlan,
  graph: SurfaceGraph,
  repairs: string[]
): LevelPlan {
  let next = plan;
  for (let pass = 0; pass < 16; pass += 1) {
    const before = next.placements.map((placement) => placement.id).join(',');
    next = dropExtras(next, repairs);
    const result = safeValidate(next, graph);
    const dropIds = new Set<string>();
    for (const item of result.issues) {
      if (item.placementId && DROP_CODES.has(item.code)) {
        dropIds.add(item.placementId);
      }
    }
    if (dropIds.size === 0) {
      if (before === next.placements.map((placement) => placement.id).join(',')) {
        break;
      }
      next = pruneRefs(next);
      continue;
    }
    for (const id of dropIds) {
      const placement = next.placements.find((item) => item.id === id);
      const piece = placement?.piece ?? 'piece';
      repairs.push(`dropped invalid ${piece} ${id}`);
    }
    next = {
      ...next,
      placements: next.placements.filter(
        (placement) => !dropIds.has(placement.id)
      ),
    };
    next = pruneRefs(next);
    const after = next.placements.map((placement) => placement.id).join(',');
    if (after === before) {
      break;
    }
  }
  return next;
}

function dropExtras(plan: LevelPlan, repairs: string[]): LevelPlan {
  const counts = new Map<string, number>();
  const kept: Placement[] = [];
  for (const placement of plan.placements) {
    const max = KIT_CATALOG[placement.piece].maxPerLevel;
    const nextCount = (counts.get(placement.piece) ?? 0) + 1;
    if (max !== undefined && nextCount > max) {
      repairs.push(`dropped extra ${placement.piece} ${placement.id}`);
      continue;
    }
    counts.set(placement.piece, nextCount);
    kept.push(placement);
  }
  if (kept.length === plan.placements.length) {
    return plan;
  }
  return { ...plan, placements: kept };
}

function pruneRefs(plan: LevelPlan): LevelPlan {
  const ids = new Set(plan.placements.map((placement) => placement.id));
  const placements = plan.placements.map((placement) => ({
    ...placement,
    links: placement.links.filter((link) => ids.has(link)),
  }));
  const beats = plan.beats.map((beat) => ({
    ...beat,
    uses: beat.uses.filter((id) => ids.has(id)),
  }));
  return { ...plan, placements, beats };
}

function insertPlanks(
  plan: LevelPlan,
  graph: SurfaceGraph,
  repairs: string[]
): LevelPlan {
  let next = plan;
  for (let n = 0; n < 4; n += 1) {
    const result = safeValidate(next, graph);
    const unreachable = result.issues.some(
      (item) => item.code === 'GOAL_UNREACHABLE'
    );
    if (!unreachable) {
      return next;
    }
    const pair = findPlankPair(next, graph);
    if (!pair) {
      return next;
    }
    let working = next;
    if (working.placements.length >= 14) {
      working = dropOneOptional(working, repairs);
    }
    if (working.placements.length >= 14) {
      return working;
    }
    const id = nextPlacementId(working);
    const plank: Placement = {
      id,
      piece: 'plank_bridge',
      surface: pair.a,
      to: pair.b,
      u: 0.8,
      v: 0.5,
      playerBuilt: true,
      links: [],
    };
    repairs.push(
      `inserted plank_bridge ${id} between ${pair.a} and ${pair.b}`
    );
    next = {
      ...working,
      placements: [...working.placements, plank],
      beats: withPlankBeat(working.beats, id),
    };
  }
  return next;
}

function dropOneOptional(plan: LevelPlan, repairs: string[]): LevelPlan {
  const optional = [...plan.placements]
    .reverse()
    .find(
      (placement) =>
        placement.piece === 'gem' ||
        placement.piece === 'slime' ||
        placement.piece === 'moving_platform'
    );
  if (!optional) {
    return plan;
  }
  repairs.push(`dropped ${optional.piece} ${optional.id} to make room for a plank`);
  return pruneRefs({
    ...plan,
    placements: plan.placements.filter(
      (placement) => placement.id !== optional.id
    ),
  });
}

function withPlankBeat(
  beats: LevelPlan['beats'],
  plankId: string
): LevelPlan['beats'] {
  if (beats.some((beat) => beat.uses.includes(plankId))) {
    return beats;
  }
  if (beats.length < 4) {
    return [
      { goal: 'Bridge the gap', uses: [plankId] },
      ...beats,
    ].slice(0, 4);
  }
  const first = beats[0];
  if (!first) {
    return [{ goal: 'Bridge the gap', uses: [plankId] }];
  }
  return [
    { ...first, uses: [...first.uses, plankId] },
    ...beats.slice(1),
  ];
}

function nextPlacementId(plan: LevelPlan): string {
  let max = 0;
  for (const placement of plan.placements) {
    const match = /^p(\d+)$/.exec(placement.id);
    const raw = match?.[1];
    if (raw === undefined) {
      continue;
    }
    const n = Number(raw);
    if (n > max) {
      max = n;
    }
  }
  return `p${String(max + 1)}`;
}

function findPlankPair(
  plan: LevelPlan,
  graph: SurfaceGraph
): { a: string; b: string } | null {
  const nodes = indexNodes(graph);
  if (!nodes.has(plan.start)) {
    return null;
  }
  const openGateIds = new Set<string>();
  for (const placement of plan.placements) {
    if (placement.piece !== 'lever') {
      continue;
    }
    const surface = nodes.get(placement.surface);
    if (!surface || !isPlayerReachable(surface)) {
      continue;
    }
    for (const link of placement.links) {
      openGateIds.add(link);
    }
  }
  const builtIds = new Set(
    plan.placements
      .filter((placement) => LINK_PIECES.has(placement.piece))
      .map((placement) => placement.id)
  );
  const adj = explorerAdjacency(plan, graph, { builtIds, openGateIds });
  const reachable = bfsReachable(plan.start, adj);
  if (reachable.has(plan.goal)) {
    return null;
  }

  const linked = linkedPairs(plan);
  const sorted = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  let best: { a: string; b: string; score: number } | null = null;

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const from = sorted[i];
      const to = sorted[j];
      if (!from || !to) {
        continue;
      }
      const key = pairKey(from.id, to.id);
      if (linked.has(key)) {
        continue;
      }
      if (!plankFits(from, to, graph)) {
        continue;
      }
      const fromR = reachable.has(from.id);
      const toR = reachable.has(to.id);
      if (fromR === toR) {
        continue;
      }
      const newly = fromR ? to.id : from.id;
      const score = newly === plan.goal ? 0 : 1;
      if (!best || score < best.score) {
        best = { a: from.id, b: to.id, score };
      }
    }
  }

  if (best) {
    return { a: best.a, b: best.b };
  }

  // Last resort: any unused plankable pair, preferring one that touches start.
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const from = sorted[i];
      const to = sorted[j];
      if (!from || !to) {
        continue;
      }
      if (linked.has(pairKey(from.id, to.id))) {
        continue;
      }
      if (!plankFits(from, to, graph)) {
        continue;
      }
      if (from.id === plan.start || to.id === plan.start) {
        return { a: from.id, b: to.id };
      }
      best ??= { a: from.id, b: to.id, score: 2 };
    }
  }
  return best ? { a: best.a, b: best.b } : null;
}

function linkedPairs(plan: LevelPlan): Set<string> {
  const set = new Set<string>();
  for (const placement of plan.placements) {
    if (!LINK_PIECES.has(placement.piece) || !placement.to) {
      continue;
    }
    set.add(pairKey(placement.surface, placement.to));
  }
  return set;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function plankFits(
  from: SurfaceNode,
  to: SurfaceNode,
  graph: SurfaceGraph
): boolean {
  const catalog = KIT_CATALOG.plank_bridge;
  const edge = findEdge(graph, from.id, to.id);
  const { gap, dh } = pairMetrics(from, to, edge);
  const minGap = catalog.minGap ?? 0;
  const maxGap = catalog.maxGap ?? Number.POSITIVE_INFINITY;
  const maxDh = catalog.maxDeltaHeight ?? Number.POSITIVE_INFINITY;
  if (gap < minGap - GEOM_EPS_M) {
    return false;
  }
  if (gap > maxGap + GEOM_EPS_M) {
    return false;
  }
  if (dh > maxDh + GEOM_EPS_M) {
    return false;
  }
  return true;
}
