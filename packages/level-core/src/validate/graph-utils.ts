import type {
  LevelPlan,
  Placement,
  SurfaceEdge,
  SurfaceGraph,
  SurfaceNode,
} from '@roomquest/schema';

/** FoV cone for start / levers / portals (PRD NFR-4, design doc §4). */
export const MAX_VIEW_ANGLE_DEG = 50;

/**
 * Geometric slack matching the surface pipeline's 5 cm rounding.
 * The synthetic living-room fixture's s1–s2 plank is |Δh| = 0.30 m
 * against a catalog max of 0.25 m; 5 cm covers scan quantization
 * without hiding real GAP/Δh failures (tests use 0.5 m / 1.2 m).
 */
export const GEOM_EPS_M = 0.05;

/** Crystal shrine must sit at least this far from the hut (PRD §4.2). */
export const MIN_PATH_DISTANCE_M = 0.8;

export type NodeIndex = ReadonlyMap<string, SurfaceNode>;

export function indexNodes(graph: SurfaceGraph): NodeIndex {
  const map = new Map<string, SurfaceNode>();
  for (const node of graph.nodes) {
    map.set(node.id, node);
  }
  return map;
}

export function indexPlacements(
  plan: LevelPlan
): ReadonlyMap<string, Placement> {
  const map = new Map<string, Placement>();
  for (const placement of plan.placements) {
    map.set(placement.id, placement);
  }
  return map;
}

/**
 * Player can operate a piece on this surface (hand pinch or ray).
 * `outOfView` is never usable (design doc §6 solvability).
 */
export function isPlayerReachable(node: SurfaceNode): boolean {
  return node.reach === 'hand' || node.reach === 'ray';
}

export function findEdge(
  graph: SurfaceGraph,
  a: string,
  b: string
): SurfaceEdge | undefined {
  for (const edge of graph.edges) {
    if ((edge.a === a && edge.b === b) || (edge.a === b && edge.b === a)) {
      return edge;
    }
  }
  return undefined;
}

export interface PairMetrics {
  gap: number;
  dh: number;
}

/**
 * Gap and |Δh| between two surfaces. Prefer the graph edge; fall back to
 * centroid/size geometry so an LLM can be told *why* a pair is illegal
 * even when the director invented a link the pipeline never emitted.
 */
export function pairMetrics(
  from: SurfaceNode,
  to: SurfaceNode,
  edge: SurfaceEdge | undefined
): PairMetrics {
  if (edge) {
    return { gap: edge.gap, dh: Math.abs(edge.dh) };
  }
  const dx = from.centroid[0] - to.centroid[0];
  const dz = from.centroid[2] - to.centroid[2];
  const horizontal = Math.sqrt(dx * dx + dz * dz);
  const gap = Math.max(0, horizontal - (from.size[0] + to.size[0]) / 2);
  const dh = Math.abs(to.topHeight - from.topHeight);
  return { gap, dh };
}

/** Horizontal centroid distance in metres. */
export function horizontalDistance(a: SurfaceNode, b: SurfaceNode): number {
  const dx = a.centroid[0] - b.centroid[0];
  const dz = a.centroid[2] - b.centroid[2];
  return Math.sqrt(dx * dx + dz * dz);
}

export function addUndirected(
  adj: Map<string, Set<string>>,
  a: string,
  b: string
): void {
  if (a === b) {
    return;
  }
  let fromA = adj.get(a);
  if (!fromA) {
    fromA = new Set<string>();
    adj.set(a, fromA);
  }
  fromA.add(b);
  let fromB = adj.get(b);
  if (!fromB) {
    fromB = new Set<string>();
    adj.set(b, fromB);
  }
  fromB.add(a);
}

const LINK_PIECES = new Set([
  'plank_bridge',
  'ramp',
  'portal',
  'moving_platform',
]);

export interface WalkState {
  /** Placement ids whose two-surface links are built */
  builtIds: ReadonlySet<string>;
  /** Gate placement ids that are open */
  openGateIds: ReadonlySet<string>;
}

/**
 * Undirected explorer adjacency.
 *
 * Walkable edges = graph `adjacent` + placed ramps + placed portals +
 * placed (player-built, assumed built) plank bridges. A gate without
 * `to` blocks entering its surface; a gate with `to` blocks that edge.
 * Open gates (linked lever hand/ray-reachable, or opened in a beat)
 * do not block.
 */
export function explorerAdjacency(
  plan: LevelPlan,
  graph: SurfaceGraph,
  state: WalkState
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();

  for (const node of graph.nodes) {
    if (!adj.has(node.id)) {
      adj.set(node.id, new Set<string>());
    }
  }

  for (const edge of graph.edges) {
    if (edge.kind === 'adjacent') {
      addUndirected(adj, edge.a, edge.b);
    }
  }

  for (const placement of plan.placements) {
    if (!LINK_PIECES.has(placement.piece)) {
      continue;
    }
    if (!placement.to) {
      continue;
    }
    const alwaysPresent = !placement.playerBuilt;
    if (alwaysPresent || state.builtIds.has(placement.id)) {
      addUndirected(adj, placement.surface, placement.to);
    }
  }

  for (const placement of plan.placements) {
    if (placement.piece !== 'gate') {
      continue;
    }
    if (state.openGateIds.has(placement.id)) {
      continue;
    }
    if (placement.to) {
      removeUndirected(adj, placement.surface, placement.to);
    } else {
      isolateIncoming(adj, placement.surface);
    }
  }

  return adj;
}

function removeUndirected(
  adj: Map<string, Set<string>>,
  a: string,
  b: string
): void {
  adj.get(a)?.delete(b);
  adj.get(b)?.delete(a);
}

/**
 * Drop every edge that *enters* `nodeId`, so the explorer cannot walk
 * onto a closed-gate surface. Outgoing edges are also dropped because
 * the graph is undirected; BFS still treats `nodeId` as reached when it
 * is the start node.
 */
function isolateIncoming(adj: Map<string, Set<string>>, nodeId: string): void {
  const neighbours = adj.get(nodeId);
  if (!neighbours) {
    return;
  }
  for (const other of neighbours) {
    adj.get(other)?.delete(nodeId);
  }
  neighbours.clear();
}

export function bfsReachable(
  start: string,
  adj: ReadonlyMap<string, ReadonlySet<string>>
): Set<string> {
  const seen = new Set<string>();
  const queue: string[] = [];
  seen.add(start);
  queue.push(start);
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined) {
      continue;
    }
    const nexts = adj.get(current);
    if (!nexts) {
      continue;
    }
    for (const next of nexts) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * Shortest start→goal walk using the same BFS as {@link bfsReachable}.
 * Returns `null` when `goal` is unreachable.
 */
export function bfsPath(
  start: string,
  goal: string,
  adj: ReadonlyMap<string, ReadonlySet<string>>
): string[] | null {
  if (start === goal) {
    return [start];
  }
  const parent = new Map<string, string>();
  const seen = new Set<string>();
  const queue: string[] = [];
  seen.add(start);
  queue.push(start);
  let head = 0;
  let found = false;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined) {
      continue;
    }
    const nexts = adj.get(current);
    if (!nexts) {
      continue;
    }
    for (const next of nexts) {
      if (seen.has(next)) {
        continue;
      }
      seen.add(next);
      parent.set(next, current);
      if (next === goal) {
        found = true;
        break;
      }
      queue.push(next);
    }
    if (found) {
      break;
    }
  }
  if (!found) {
    return null;
  }
  const path: string[] = [];
  let node: string | undefined = goal;
  while (node !== undefined) {
    path.push(node);
    if (node === start) {
      break;
    }
    node = parent.get(node);
  }
  path.reverse();
  if (path[0] !== start) {
    return null;
  }
  return path;
}

/**
 * Nodes that lie on some start→goal walk (reachable from start and from
 * which the goal is still reachable). Used for `mustBeOnPath` gems/gates.
 */
export function nodesOnSomePath(
  start: string,
  goal: string,
  adj: ReadonlyMap<string, ReadonlySet<string>>
): Set<string> {
  const fromStart = bfsReachable(start, adj);
  if (!fromStart.has(goal)) {
    return new Set<string>();
  }
  const reverse = reverseAdj(adj);
  const fromGoal = bfsReachable(goal, reverse);
  const onPath = new Set<string>();
  for (const id of fromStart) {
    if (fromGoal.has(id)) {
      onPath.add(id);
    }
  }
  return onPath;
}

function reverseAdj(
  adj: ReadonlyMap<string, ReadonlySet<string>>
): Map<string, Set<string>> {
  // Undirected, so reverse === forward, but copy for safety.
  const out = new Map<string, Set<string>>();
  for (const [from, tos] of adj) {
    let set = out.get(from);
    if (!set) {
      set = new Set<string>();
      out.set(from, set);
    }
    for (const to of tos) {
      set.add(to);
      let back = out.get(to);
      if (!back) {
        back = new Set<string>();
        out.set(to, back);
      }
      back.add(from);
    }
  }
  return out;
}

export function formatNum(value: number, digits = 2): string {
  return value.toFixed(digits);
}
