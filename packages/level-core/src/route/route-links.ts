import type { PieceId, SurfaceGraph, SurfaceNode } from '@roomquest/schema';
import { classifyPair, type Link, type LinkKind } from '../generate/links';
import { findEdge } from '../validate/graph-utils';
import { pairFitsPiece, pieceFitsSurface } from '../validate/piece-fits';

/** One directed hop the explorer can take from a surface. */
export interface RouteLink {
  to: string;
  kind: LinkKind;
  /** Connector piece the hop needs; `null` for a scanned `adjacent` walk. */
  piece: Extract<PieceId, 'plank_bridge' | 'ramp' | 'portal'> | null;
  /** Same cost scale as `possibleLinks` (adjacent < plank < ramp < portal). */
  cost: number;
}

/** Outgoing hops per surface id, neighbours sorted by id. */
export type RouteLinkMap = Record<string, RouteLink[]>;

export interface RouteLinksOptions {
  /**
   * Accepted for API symmetry with the other hybrid-route helpers. Links
   * are a pure function of the graph, so the seed does not change them.
   */
  seed?: string;
}

const CONNECTORS: readonly {
  piece: NonNullable<RouteLink['piece']>;
  kind: LinkKind;
}[] = [
  { piece: 'plank_bridge', kind: 'plank' },
  { piece: 'ramp', kind: 'ramp' },
  { piece: 'portal', kind: 'portal' },
];

/**
 * For each surface, the surfaces the explorer can reach from it in one
 * hop: a scanned `adjacent` edge, or a plank / ramp / portal whose
 * pair rules (gap, Δh, ramp floor run / slope, portal FoV) and surface
 * rules pass the same `pairFitsPiece` / `pieceFitsSurface` checks that
 * `validatePlan` runs. Graph waivers (#60/#65 `RelaxedRule`s such as
 * `portalFov` and `hutTable`) are honoured because those helpers apply
 * them. Pure and deterministic.
 */
export function routeLinks(
  graph: SurfaceGraph,
  _opts?: RouteLinksOptions
): RouteLinkMap {
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const out: RouteLinkMap = {};
  for (const from of nodes) {
    const list: RouteLink[] = [];
    for (const to of nodes) {
      if (to.id === from.id) {
        continue;
      }
      const hop = hopBetween(from, to, graph);
      if (hop) {
        list.push(hop);
      }
    }
    out[from.id] = list;
  }
  return out;
}

/** Cheapest legal hop `from → to`, or `null`. */
export function hopBetween(
  from: SurfaceNode,
  to: SurfaceNode,
  graph: SurfaceGraph
): RouteLink | null {
  const base = classifyPair(from, to, graph);
  const cost = (kind: LinkKind): number =>
    base?.kind === kind ? base.cost : costOfKind(kind);
  if (findEdge(graph, from.id, to.id)?.kind === 'adjacent') {
    return { to: to.id, kind: 'adjacent', piece: null, cost: cost('adjacent') };
  }
  for (const { piece, kind } of CONNECTORS) {
    if (
      pairFitsPiece(piece, from, to, graph) &&
      pieceFitsSurface(piece, from, graph)
    ) {
      return { to: to.id, kind, piece, cost: cost(kind) };
    }
  }
  return null;
}

/** Rank used when `classifyPair` picked a cheaper kind the pieces reject. */
function costOfKind(kind: LinkKind): number {
  return CONNECTORS.findIndex((c) => c.kind === kind) + 1.5;
}

/** Directed {@link Link}s for a walk, as `planAlongPath` expects. */
export function linksForPath(
  path: readonly string[],
  map: RouteLinkMap
): Link[] | null {
  const links: Link[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const hop = a === undefined ? undefined : map[a]?.find((h) => h.to === b);
    if (!a || !b || !hop) {
      return null;
    }
    links.push({ a, b, kind: hop.kind, cost: hop.cost });
  }
  return links;
}

/**
 * Deterministic Dijkstra over {@link RouteLinkMap}. `weight` scales a hop
 * cost (repairRoute uses it to prefer the plan's original surfaces).
 */
export function cheapestRoute(
  map: RouteLinkMap,
  start: string,
  goal: string,
  weight: (from: string, hop: RouteLink) => number = (_f, h) => h.cost
): string[] | null {
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  for (;;) {
    let cur: string | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const [id, d] of dist) {
      if (done.has(id)) {
        continue;
      }
      if (d < best || (d === best && cur !== undefined && id < cur)) {
        best = d;
        cur = id;
      }
    }
    if (cur === undefined) {
      return null;
    }
    if (cur === goal) {
      break;
    }
    done.add(cur);
    for (const hop of map[cur] ?? []) {
      const nd = best + weight(cur, hop);
      const old = dist.get(hop.to);
      if (old === undefined || nd < old) {
        dist.set(hop.to, nd);
        prev.set(hop.to, cur);
      }
    }
  }
  const path = [goal];
  let node = goal;
  while (node !== start) {
    const p = prev.get(node);
    if (p === undefined) {
      return null;
    }
    path.push(p);
    node = p;
  }
  return path.reverse();
}
