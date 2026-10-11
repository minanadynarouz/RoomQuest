import type { Beat, LevelPlan, Placement, SurfaceGraph, Tier } from '@roomquest/schema';
import { generatePlanResult, planAlongPath, pickGoal, pickStart } from '../generate/generate-plan';
import { createRng } from '../generate/prng';
import { reachableFrom } from '../generate/links';
import { repairPlan } from '../repair/repair-plan';
import { snapPlacementsToSlots } from '../repair/snap-slots';
import { indexNodes } from '../validate/graph-utils';
import { pieceFitsSurface } from '../validate/piece-fits';
import type { Issue } from '../validate/types';
import { validatePlan } from '../validate/validate-plan';
import {
  cheapestRoute,
  linksForPath,
  routeLinks,
  type RouteLinkMap,
} from './route-links';
import { freshId } from './candidates';

export interface RepairRouteOptions {
  seed: string;
  /** Tier for the skeleton fallback. Default `easy`. */
  tier?: Tier;
}

export interface RepairRouteResult {
  plan: LevelPlan;
  changed: boolean;
  /** validatePlan issues left on the returned plan (empty when fixed). */
  issues: Issue[];
  /** `kept` = original route rebuilt; `skeleton` = clean path fallback. */
  strategy: 'unchanged' | 'kept' | 'skeleton' | 'none';
}

const CONNECTOR = new Set(['plank_bridge', 'ramp', 'portal']);
/** Hops onto a surface the plan already used cost this fraction. */
const KEEP_WEIGHT = 0.5;

/**
 * Rebuild a broken start→goal route over {@link routeLinks}.
 *
 * Pure and deterministic. Keeps the plan's start/goal when they still
 * work, prefers its surfaces and reuses matching connector placements,
 * keeps non-connector pieces and beats, then snaps placements. If that
 * still fails validatePlan it falls back to a clean path skeleton
 * (generatePlan's `planAlongPath`). Intended order in the director:
 * snapPlacementsToSlots → repairRoute → repairPlan.
 */
export function repairRoute(
  plan: LevelPlan,
  graph: SurfaceGraph,
  opts: RepairRouteOptions
): RepairRouteResult {
  const before = validatePlan(plan, graph);
  if (before.ok) {
    return { plan, changed: false, issues: [], strategy: 'unchanged' };
  }
  const map = routeLinks(graph, { seed: opts.seed });
  const ends = pickEnds(plan, graph, map);
  if (!ends) {
    return finish(plan, generatePlanResult(graph, opts.seed, opts.tier ?? 'easy').plan, graph, 'skeleton');
  }
  const used = new Set<string>();
  for (const p of plan.placements) {
    used.add(p.surface);
    if (p.to) {
      used.add(p.to);
    }
  }
  const path = cheapestRoute(map, ends.start, ends.goal, (_from, hop) =>
    used.has(hop.to) ? hop.cost * KEEP_WEIGHT : hop.cost
  );
  if (path) {
    const kept = rebuildAlong(plan, graph, map, path);
    if (kept) {
      const snapped = snapPlacementsToSlots(kept, graph).plan;
      if (validatePlan(snapped, graph).ok) {
        return finish(plan, snapped, graph, 'kept');
      }
      const repaired = repairPlan(snapped, graph);
      if (repaired.result.ok && repaired.plan.goal === ends.goal) {
        return finish(plan, repaired.plan, graph, 'kept');
      }
    }
    const skeleton = skeletonAlong(plan, graph, map, path, opts);
    if (skeleton) {
      return finish(plan, skeleton, graph, 'skeleton');
    }
  }
  const fresh = generatePlanResult(graph, opts.seed, opts.tier ?? 'easy').plan;
  const out = validatePlan(fresh, graph).ok ? fresh : plan;
  return finish(plan, out, graph, out === plan ? 'none' : 'skeleton');
}

function finish(
  original: LevelPlan,
  plan: LevelPlan,
  graph: SurfaceGraph,
  strategy: RepairRouteResult['strategy']
): RepairRouteResult {
  const result = validatePlan(plan, graph);
  return {
    plan,
    changed: JSON.stringify(plan) !== JSON.stringify(original),
    issues: result.issues,
    strategy: result.ok ? strategy : 'none',
  };
}

function pickEnds(
  plan: LevelPlan,
  graph: SurfaceGraph,
  map: RouteLinkMap
): { start: string; goal: string } | null {
  const nodes = indexNodes(graph);
  const startNode = nodes.get(plan.start);
  const start =
    startNode && pieceFitsSurface('village_hut', startNode, graph)
      ? startNode
      : pickStart(graph.nodes);
  const reach = reachable(map, start.id);
  const goalNode = nodes.get(plan.goal);
  if (goalNode && goalNode.id !== start.id && reach.has(goalNode.id)) {
    return { start: start.id, goal: goalNode.id };
  }
  const goal = pickGoal(start, graph.nodes, reach);
  return goal.id === start.id ? null : { start: start.id, goal: goal.id };
}

function reachable(map: RouteLinkMap, start: string): Set<string> {
  const links = Object.entries(map).flatMap(([a, hops]) =>
    hops.map((h) => ({ a, b: h.to, kind: h.kind, cost: h.cost }))
  );
  return reachableFrom(start, links);
}

/** Original pieces + beats re-hung on `path`. */
function rebuildAlong(
  plan: LevelPlan,
  graph: SurfaceGraph,
  map: RouteLinkMap,
  path: readonly string[]
): LevelPlan | null {
  const start = path[0];
  const goal = path[path.length - 1];
  if (start === undefined || goal === undefined) {
    return null;
  }
  const nodes = indexNodes(graph);
  const pathSet = new Set(path);
  const placements: Placement[] = [];
  const fresh: Placement[] = [];
  const draft: LevelPlan = { ...plan, placements };

  for (const p of plan.placements) {
    if (CONNECTOR.has(p.piece) || !nodes.has(p.surface)) {
      continue;
    }
    if (p.piece === 'village_hut') {
      placements.push({ ...p, surface: start });
    } else if (p.piece === 'crystal_shrine') {
      placements.push({ ...p, surface: goal });
    } else if ((p.piece === 'gem' || p.piece === 'gate') && !pathSet.has(p.surface)) {
      continue;
    } else {
      placements.push({ ...p, links: [...p.links] });
    }
  }
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i] ?? '';
    const b = path[i + 1] ?? '';
    const hop = map[a]?.find((h) => h.to === b);
    if (!hop?.piece) {
      continue;
    }
    const same = plan.placements.find(
      (p) =>
        p.piece === hop.piece &&
        ((p.surface === a && p.to === b) || (p.surface === b && p.to === a))
    );
    if (same) {
      placements.push({ ...same, surface: a, to: b, links: [...same.links] });
      continue;
    }
    const conn: Placement = {
      id: freshId(draft, 'c'),
      piece: hop.piece,
      surface: a,
      to: b,
      u: 0.5,
      v: 0.5,
      playerBuilt: hop.piece !== 'portal',
      links: [],
    };
    placements.push(conn);
    fresh.push(conn);
  }
  // A gate whose lever was dropped would block the route.
  const ids = new Set(placements.map((p) => p.id));
  const leverOf = new Set(
    placements.filter((p) => p.piece === 'lever').flatMap((p) => p.links)
  );
  const kept = placements.filter((p) => p.piece !== 'gate' || leverOf.has(p.id));
  if (!kept.some((p) => p.piece === 'village_hut') || !kept.some((p) => p.piece === 'crystal_shrine')) {
    return null;
  }
  while (kept.length > 14) {
    const idx = kept.findIndex((p) => p.piece === 'gem' || p.piece === 'slime' || p.piece === 'moving_platform');
    if (idx < 0) {
      return null;
    }
    kept.splice(idx, 1);
  }
  const keptIds = new Set(kept.map((p) => p.id));
  for (const p of kept) {
    p.links = p.links.filter((l) => keptIds.has(l));
  }
  return {
    ...plan,
    start,
    goal,
    placements: kept,
    beats: rebuildBeats(plan.beats, kept, fresh, ids),
  };
}

function rebuildBeats(
  beats: readonly Beat[],
  placements: readonly Placement[],
  fresh: readonly Placement[],
  _ids: ReadonlySet<string>
): Beat[] {
  const ids = new Set(placements.map((p) => p.id));
  const shrine = placements.find((p) => p.piece === 'crystal_shrine');
  let out: Beat[] = beats
    .map((b) => ({ ...b, uses: b.uses.filter((u) => ids.has(u)) }))
    .filter((b) => b.uses.length > 0);
  const built = fresh.filter((p) => p.playerBuilt).map((p) => p.id);
  if (built.length > 0) {
    const bridge = out.find((b) =>
      b.uses.some((u) => placements.find((p) => p.id === u && CONNECTOR.has(p.piece)))
    );
    if (bridge) {
      bridge.uses = [...bridge.uses, ...built];
    } else {
      out.unshift({ goal: 'Bridge the gap along the new route', uses: built });
    }
  }
  if (shrine) {
    out = out.map((b) => ({ ...b, uses: b.uses.filter((u) => u !== shrine.id) })).filter((b) => b.uses.length > 0);
    while (out.length > 3) {
      const last = out.pop();
      const prev = out[out.length - 1];
      if (last && prev) {
        prev.uses = [...prev.uses, ...last.uses];
      }
    }
    out.push({ goal: 'Reach the crystal shrine', uses: [shrine.id] });
  }
  while (out.length < 2 && shrine) {
    out.unshift({ goal: 'Help the explorer onward', uses: [placements[0]?.id ?? shrine.id] });
  }
  return out.slice(0, 4);
}

function skeletonAlong(
  plan: LevelPlan,
  graph: SurfaceGraph,
  map: RouteLinkMap,
  path: readonly string[],
  opts: RepairRouteOptions
): LevelPlan | null {
  const nodes = indexNodes(graph);
  const start = nodes.get(path[0] ?? '');
  const goal = nodes.get(path[path.length - 1] ?? '');
  const links = linksForPath(path, map);
  if (!start || !goal || !links) {
    return null;
  }
  const out = planAlongPath(graph, plan.seed, opts.tier ?? 'easy', {
    rng: createRng(`${opts.seed}|repairRoute`),
    theme: plan.theme,
    title: plan.title,
    start,
    goal,
    path,
    links,
  });
  return validatePlan(out, graph).ok ? out : null;
}
