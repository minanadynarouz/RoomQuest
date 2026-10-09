import {
  KIT_CATALOG,
  type SurfaceGraph,
  type SurfaceNode,
} from '@roomquest/schema';
import {
  findEdge,
  GEOM_EPS_M,
  MAX_VIEW_ANGLE_DEG,
  pairMetrics,
} from '../validate/graph-utils';

export type LinkKind = 'adjacent' | 'plank' | 'ramp' | 'portal';

export interface Link {
  a: string;
  b: string;
  kind: LinkKind;
  cost: number;
}

/**
 * Cheapest legal explorer link for every node pair.
 * adjacent < plank < ramp < portal, so Dijkstra prefers existing walks.
 */
export function possibleLinks(graph: SurfaceGraph): Link[] {
  const links: Link[] = [];
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const from = nodes[i];
      const to = nodes[j];
      if (!from || !to) {
        continue;
      }
      const link = classifyPair(from, to, graph);
      if (link) {
        links.push(link);
      }
    }
  }
  return links;
}

export function classifyPair(
  from: SurfaceNode,
  to: SurfaceNode,
  graph: SurfaceGraph
): Link | null {
  const edge = findEdge(graph, from.id, to.id);
  const { gap, dh } = pairMetrics(from, to, edge);
  if (edge?.kind === 'adjacent') {
    return { a: from.id, b: to.id, kind: 'adjacent', cost: 0.1 + gap };
  }
  if (plankFits(gap, dh)) {
    return { a: from.id, b: to.id, kind: 'plank', cost: 1 + gap };
  }
  if (rampFits(from, to, gap, dh)) {
    return { a: from.id, b: to.id, kind: 'ramp', cost: 2 + dh };
  }
  if (portalFits(from, to)) {
    return { a: from.id, b: to.id, kind: 'portal', cost: 20 };
  }
  return null;
}

export function plankFits(gap: number, dh: number): boolean {
  const catalog = KIT_CATALOG.plank_bridge;
  const minGap = catalog.minGap ?? 0;
  const maxGap = catalog.maxGap ?? Number.POSITIVE_INFINITY;
  const maxDh = catalog.maxDeltaHeight ?? Number.POSITIVE_INFINITY;
  return (
    gap >= minGap - GEOM_EPS_M &&
    gap <= maxGap + GEOM_EPS_M &&
    dh <= maxDh + GEOM_EPS_M
  );
}

export function rampFits(
  from: SurfaceNode,
  to: SurfaceNode,
  gap: number,
  dh: number
): boolean {
  const catalog = KIT_CATALOG.ramp;
  const maxDh = catalog.maxDeltaHeight ?? Number.POSITIVE_INFINITY;
  if (dh > maxDh + GEOM_EPS_M) {
    return false;
  }
  const floor =
    from.label === 'floor' ? from : to.label === 'floor' ? to : null;
  const run = floor
    ? Math.max(gap, Math.min(floor.size[0], floor.size[1]))
    : gap;
  return run >= 2 * dh;
}

export function portalFits(from: SurfaceNode, to: SurfaceNode): boolean {
  return (
    from.angleFromForward <= MAX_VIEW_ANGLE_DEG &&
    to.angleFromForward <= MAX_VIEW_ANGLE_DEG
  );
}

export function linkBetween(
  links: readonly Link[],
  a: string,
  b: string
): Link | undefined {
  return links.find(
    (link) =>
      (link.a === a && link.b === b) || (link.a === b && link.b === a)
  );
}

/**
 * Deterministic Dijkstra. Equal-cost ties walk the lexicographically
 * smaller neighbour first so (graph, seed, tier) stays stable.
 */
export function shortestPath(
  start: string,
  goal: string,
  links: readonly Link[]
): string[] | null {
  const adj = new Map<string, { to: string; cost: number }[]>();
  const add = (from: string, to: string, cost: number): void => {
    const list = adj.get(from) ?? [];
    list.push({ to, cost });
    adj.set(from, list);
  };
  for (const link of links) {
    add(link.a, link.b, link.cost);
    add(link.b, link.a, link.cost);
  }
  for (const [, list] of adj) {
    list.sort((a, b) => a.to.localeCompare(b.to) || a.cost - b.cost);
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  dist.set(start, 0);
  const queue: { id: string; d: number }[] = [{ id: start, d: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
    const cur = queue.shift();
    if (!cur) {
      break;
    }
    const best = dist.get(cur.id);
    if (best !== undefined && cur.d > best) {
      continue;
    }
    if (cur.id === goal) {
      break;
    }
    for (const edge of adj.get(cur.id) ?? []) {
      const nd = cur.d + edge.cost;
      const old = dist.get(edge.to);
      if (old === undefined || nd < old) {
        dist.set(edge.to, nd);
        prev.set(edge.to, cur.id);
        queue.push({ id: edge.to, d: nd });
      }
    }
  }

  if (!dist.has(goal)) {
    return null;
  }
  const path: string[] = [];
  let node: string | undefined = goal;
  while (node !== undefined) {
    path.push(node);
    if (node === start) {
      break;
    }
    node = prev.get(node);
  }
  path.reverse();
  if (path[0] !== start) {
    return null;
  }
  return path;
}

export function reachableFrom(
  start: string,
  links: readonly Link[]
): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    if (cur === undefined) {
      continue;
    }
    for (const link of links) {
      const next =
        link.a === cur ? link.b : link.b === cur ? link.a : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}
