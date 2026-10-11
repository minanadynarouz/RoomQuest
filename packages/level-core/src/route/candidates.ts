import {
  KIT_CATALOG,
  type LevelPlan,
  type PieceId,
  type Placement,
  type RelaxedRule,
  type SurfaceGraph,
  type SurfaceLabel,
  type SurfaceNode,
  type Tier,
} from '@roomquest/schema';
import { pickTheme, pickTitle } from '../generate/dialogue';
import { LABEL_WORD, planAlongPath } from '../generate/generate-plan';
import { createRng, hashString } from '../generate/prng';
import { snapPlacementsToSlots } from '../repair/snap-slots';
import { graphCanSeparateHutAndShrine } from '../validate/graph-capacity';
import {
  horizontalDistance,
  indexNodes,
  MIN_PATH_DISTANCE_M,
} from '../validate/graph-utils';
import { pieceFitsSurface } from '../validate/piece-fits';
import { relaxedRulesFor } from '../validate/relaxed-rules';
import { validatePlan } from '../validate/validate-plan';
import { linksForPath, routeLinks, type RouteLinkMap } from './route-links';

/** Hazards Gemini may hang on a beat. String ids, Gemini-safe enum. */
export const HAZARD_TYPES = ['slime', 'gate', 'moving_platform'] as const;
export type HazardType = (typeof HAZARD_TYPES)[number];

/** Decoration choices a route offers. Beats are string indexes ("0".."3"). */
export interface RouteOptions {
  twistBeats: string[];
  hazards: { beat: string; types: HazardType[] }[];
}

export interface CandidateRoute {
  /** `r0`, `r1`, … stable per (graph, seed, tier). */
  id: string;
  /** e.g. "sofa, then bookshelf, then desk, 4 beats" */
  summary: string;
  /** Surface ids start → goal. */
  surfaces: string[];
  plan: LevelPlan;
  relaxed: RelaxedRule[];
  options: RouteOptions;
  /** Graph the route was built on (applyDecoration re-validates on it). */
  graph: SurfaceGraph;
}

export interface CandidateRoutesOptions {
  seed: string;
  tier: Tier;
  /** Routes wanted; clamped to 3..5. Default 4. */
  k?: number;
}

const SUMMARY_WORD: Record<SurfaceLabel, string> = {
  ...LABEL_WORD,
  couch: 'sofa',
  shelf: 'bookshelf',
  other: 'ledge',
};

const MAX_HOPS = 6;
const MAX_WALKS = 400;
/** Distinct valid routes gathered before the diversity pick. */
const POOL_FACTOR = 3;

/**
 * 3–5 distinct, validatePlan-clean LevelPlans over {@link routeLinks}.
 * Each reuses generatePlan's per-tier variety via `planAlongPath`.
 * Distinctness is judged on the route's connector set + endpoints, so
 * walks that differ only by an extra `adjacent` step collapse. Fewer
 * than 3 are returned only when the graph has fewer distinct routes.
 */
export function candidateRoutes(
  graph: SurfaceGraph,
  opts: CandidateRoutesOptions
): CandidateRoute[] {
  const k = Math.min(5, Math.max(3, opts.k ?? 4));
  const { seed, tier } = opts;
  const map = routeLinks(graph, { seed });
  const relaxed = relaxedRulesFor(graph);
  const nodes = indexNodes(graph);
  const theme = pickTheme(hashString(seed), undefined);

  const seen = new Set<string>();
  const pool: { key: string; path: string[]; plan: LevelPlan }[] = [];
  for (const path of enumerateWalks(graph, map)) {
    if (pool.length >= k * POOL_FACTOR) {
      break;
    }
    const key = walkKey(path, map);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const plan = buildRoutePlan(graph, map, path, seed, tier, theme);
    if (!plan) {
      continue;
    }
    const planKey = planRouteKey(plan);
    if (seen.has(planKey)) {
      continue;
    }
    seen.add(planKey);
    pool.push({ key, path, plan });
  }

  const picked = pickDiverse(pool, k, `${seed}|${tier}|routes`);
  return picked.map((item, index) => {
    const plan = { ...item.plan };
    return {
      id: `r${String(index)}`,
      summary: summarize(item.path, plan, nodes),
      surfaces: [...item.path],
      plan,
      relaxed: [...relaxed],
      options: routeOptions(plan, graph),
      graph,
    };
  });
}

/** Simple start→goal walks, shortest first, then lexicographic. */
function enumerateWalks(graph: SurfaceGraph, map: RouteLinkMap): string[][] {
  const separable = graphCanSeparateHutAndShrine(graph);
  const nodes = indexNodes(graph);
  const starts = [...graph.nodes]
    .filter((n) => pieceFitsSurface('village_hut', n, graph))
    .sort((a, b) => b.area - a.area || a.id.localeCompare(b.id));
  const walks: string[][] = [];
  for (const start of starts) {
    const stack: string[][] = [[start.id]];
    while (stack.length > 0 && walks.length < MAX_WALKS) {
      const path = stack.pop();
      const last = path?.[path.length - 1];
      if (!path || last === undefined) {
        continue;
      }
      const lastNode = nodes.get(last);
      if (path.length > 1 && lastNode && goalOk(start, lastNode, separable)) {
        walks.push(path);
      }
      if (path.length > MAX_HOPS) {
        continue;
      }
      const hops = [...(map[last] ?? [])].reverse();
      for (const hop of hops) {
        if (!path.includes(hop.to)) {
          stack.push([...path, hop.to]);
        }
      }
    }
  }
  return walks.sort(
    (a, b) => a.length - b.length || a.join('>').localeCompare(b.join('>'))
  );
}

function goalOk(
  start: SurfaceNode,
  goal: SurfaceNode,
  separable: boolean
): boolean {
  return !separable || horizontalDistance(start, goal) >= MIN_PATH_DISTANCE_M;
}

/** Endpoints + connector hops; `adjacent` detours do not count. */
export function walkKey(path: readonly string[], map: RouteLinkMap): string {
  const hops: string[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i] ?? '';
    const b = path[i + 1] ?? '';
    const hop = map[a]?.find((h) => h.to === b);
    if (hop?.piece) {
      hops.push(`${hop.piece}:${a}>${b}`);
    }
  }
  return `${path[0] ?? ''}|${path[path.length - 1] ?? ''}|${hops.sort().join(',')}`;
}

/** Same idea on the finished plan (repairPlan may have changed links). */
export function planRouteKey(plan: LevelPlan): string {
  const hops = plan.placements
    .filter((p) => p.to !== undefined)
    .map((p) => `${p.piece}:${p.surface}>${p.to ?? ''}`)
    .sort();
  return `plan|${plan.start}|${plan.goal}|${hops.join(',')}`;
}

export function buildRoutePlan(
  graph: SurfaceGraph,
  map: RouteLinkMap,
  path: readonly string[],
  seed: string,
  tier: Tier,
  theme: LevelPlan['theme']
): LevelPlan | null {
  const nodes = indexNodes(graph);
  const start = nodes.get(path[0] ?? '');
  const goal = nodes.get(path[path.length - 1] ?? '');
  const links = linksForPath(path, map);
  if (!start || !goal || !links || start.id === goal.id) {
    return null;
  }
  const rng = createRng(`${seed}|${tier}`);
  const title = pickTitle(theme, rng);
  const plan = planAlongPath(graph, seed, tier, {
    rng,
    theme,
    title,
    start,
    goal,
    path,
    links,
  });
  if (plan.start !== start.id || plan.goal !== goal.id) {
    return null;
  }
  return validatePlan(plan, graph).ok ? plan : null;
}

/** Greedy max-novelty pick with a seeded tiebreak — deterministic. */
function pickDiverse<T extends { key: string; path: string[] }>(
  pool: readonly T[],
  k: number,
  seed: string
): T[] {
  const rng = createRng(seed);
  const jitter = new Map(pool.map((item) => [item.key, rng.next()]));
  const picked: T[] = [];
  const left = [...pool];
  while (picked.length < k && left.length > 0) {
    let bestIdx = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    left.forEach((item, idx) => {
      const novelty = picked.length === 0 ? 0 : minDistance(item, picked);
      const score =
        novelty * 10 + item.path.length * 0.5 + (jitter.get(item.key) ?? 0);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    const [chosen] = left.splice(bestIdx, 1);
    if (chosen) {
      picked.push(chosen);
    }
  }
  return picked;
}

function minDistance(
  item: { path: string[] },
  picked: readonly { path: string[] }[]
): number {
  let min = Number.POSITIVE_INFINITY;
  const a = new Set(item.path);
  for (const other of picked) {
    const b = new Set(other.path);
    const inter = [...a].filter((x) => b.has(x)).length;
    const union = new Set([...a, ...b]).size;
    min = Math.min(min, 1 - inter / union);
  }
  return min;
}

function summarize(
  path: readonly string[],
  plan: LevelPlan,
  nodes: ReadonlyMap<string, SurfaceNode>
): string {
  const words = path.map((id) => {
    const node = nodes.get(id);
    return node ? SUMMARY_WORD[node.label] : id;
  });
  const beats = plan.beats.length;
  return `${words.join(', then ')}, ${String(beats)} beat${beats === 1 ? '' : 's'}`;
}

function routeOptions(plan: LevelPlan, graph: SurfaceGraph): RouteOptions {
  const twistBeats = twistBeatsFor(plan);
  const hazards: RouteOptions['hazards'] = [];
  plan.beats.forEach((_beat, index) => {
    const types = HAZARD_TYPES.filter(
      (type) => withHazard(plan, graph, index, type) !== null
    );
    if (types.length > 0) {
      hazards.push({ beat: String(index), types: [...types] });
    }
  });
  return { twistBeats, hazards };
}

/** Every beat except the final shrine beat may carry the twist. */
export function twistBeatsFor(plan: LevelPlan): string[] {
  const shrine = plan.placements.find((p) => p.piece === 'crystal_shrine');
  const out: string[] = [];
  plan.beats.forEach((beat, index) => {
    const last = index === plan.beats.length - 1;
    if (!(last && shrine && beat.uses.includes(shrine.id))) {
      out.push(String(index));
    }
  });
  return out.length > 0 ? out : ['0'];
}

/**
 * Add `type` to beat `beatIndex`, trying route surfaces in walk order.
 * Returns a snapped, validatePlan-clean plan or `null`.
 */
export function withHazard(
  plan: LevelPlan,
  graph: SurfaceGraph,
  beatIndex: number,
  type: HazardType
): LevelPlan | null {
  const beat = plan.beats[beatIndex];
  if (!beat) {
    return null;
  }
  const max = KIT_CATALOG[type].maxPerLevel;
  const count = plan.placements.filter((p) => p.piece === type).length;
  if (max !== undefined && count >= max) {
    return null;
  }
  const nodes = indexNodes(graph);
  const surfaces = routeSurfaces(plan);
  const fits = (piece: PieceId, id: string): boolean => {
    const node = nodes.get(id);
    return node !== undefined && pieceFitsSurface(piece, node, graph);
  };
  const tries: { add: Placement[]; uses: string[] }[] = [];
  const hid = freshId(plan, 'h');
  if (type === 'gate') {
    const lid = `${hid}l`;
    const leverSurfaces = graph.nodes
      .map((n) => n.id)
      .filter((id) => fits('lever', id))
      .sort();
    for (const gs of surfaces.filter((id) => id !== plan.start)) {
      for (const ls of leverSurfaces) {
        tries.push({
          add: [
            piece('gate', hid, gs, []),
            piece('lever', lid, ls, [hid]),
          ],
          uses: [lid, hid],
        });
      }
    }
  } else {
    for (const s of surfaces.filter((id) => fits(type, id))) {
      tries.push({ add: [piece(type, hid, s, [])], uses: [hid] });
    }
  }
  for (const attempt of tries) {
    const next: LevelPlan = {
      ...plan,
      placements: [...plan.placements, ...attempt.add],
      beats: plan.beats.map((b, i) =>
        i === beatIndex ? { ...b, uses: [...b.uses, ...attempt.uses] } : b
      ),
    };
    const snapped = snapPlacementsToSlots(next, graph).plan;
    if (validatePlan(snapped, graph).ok) {
      return snapped;
    }
  }
  return null;
}

function routeSurfaces(plan: LevelPlan): string[] {
  const out: string[] = [plan.start];
  for (const p of plan.placements) {
    for (const id of [p.surface, p.to]) {
      if (id !== undefined && !out.includes(id)) {
        out.push(id);
      }
    }
  }
  return out;
}

function piece(
  type: PieceId,
  id: string,
  surface: string,
  links: string[]
): Placement {
  return { id, piece: type, surface, u: 0.5, v: 0.5, playerBuilt: false, links };
}

export function freshId(plan: LevelPlan, prefix: string): string {
  const ids = new Set(plan.placements.map((p) => p.id));
  let n = 1;
  while (ids.has(`${prefix}${String(n)}`)) {
    n += 1;
  }
  return `${prefix}${String(n)}`;
}
