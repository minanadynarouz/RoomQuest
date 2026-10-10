import type {
  LevelPlan,
  Placement,
  PieceId,
  SurfaceGraph,
  SurfaceNode,
} from '@roomquest/schema';
import { classifyPair } from '../generate/links';
import {
  footprintsOverlap,
  listSlotsForPiece,
  orientedFootprint,
  pieceUvRange,
  quantizeUv,
  uvInside,
} from '../placement/slots';
import {
  bfsReachable,
  explorerAdjacency,
  horizontalDistance,
  indexNodes,
  nodesOnSomePath,
  type NodeIndex,
} from '../validate/graph-utils';
import { pairFitsPiece, pieceFitsSurface } from '../validate/piece-fits';

export interface SnapPose {
  surface: string;
  u: number;
  v: number;
  to?: string;
}

export interface SnapChange {
  id: string;
  from: SnapPose;
  to: SnapPose;
  reason: string;
}

export interface SnapResult {
  plan: LevelPlan;
  changes: SnapChange[];
}

interface Occupied {
  id: string;
  surface: string;
  u: number;
  v: number;
  piece: PieceId;
}

const LINK_PIECES = new Set<PieceId>(['plank_bridge', 'ramp', 'portal']);

const PRIORITY: Readonly<Record<PieceId, number>> = {
  village_hut: 0,
  crystal_shrine: 0,
  plank_bridge: 1,
  ramp: 1,
  portal: 1,
  lever: 2,
  gate: 2,
  moving_platform: 3,
  slime: 3,
  gem: 3,
};

/**
 * Move geometrically invalid placements onto the nearest free slot.
 *
 * Unknown surfaces are left untouched. Intended as a local repair before
 * a second LLM call — does not mutate `plan` or `graph`.
 */
export function snapPlacementsToSlots(
  plan: LevelPlan,
  graph: SurfaceGraph
): SnapResult {
  const next = clonePlan(plan);
  const nodes = indexNodes(graph);
  const changes: SnapChange[] = [];
  const ordered = [...next.placements].sort((a, b) => {
    const pa = PRIORITY[a.piece];
    const pb = PRIORITY[b.piece];
    return pa - pb || a.id.localeCompare(b.id);
  });

  const accepted: Occupied[] = [];
  const byId = new Map(next.placements.map((item) => [item.id, item]));

  for (const placement of ordered) {
    const current = byId.get(placement.id);
    if (!current) {
      continue;
    }
    if (!nodes.has(current.surface)) {
      continue;
    }
    const reason = invalidReason(current, nodes, graph, accepted, next);
    if (reason === null) {
      accepted.push(toOccupied(current));
      continue;
    }
    const moved = moveToSlot(
      current,
      next,
      graph,
      nodes,
      accepted,
      reason
    );
    if (!moved) {
      accepted.push(toOccupied(current));
      continue;
    }
    const updated: Placement = {
      ...current,
      surface: moved.surface,
      u: moved.u,
      v: moved.v,
    };
    if (moved.to !== undefined) {
      updated.to = moved.to;
    } else {
      delete updated.to;
    }
    applyPlacement(next, updated);
    byId.set(updated.id, updated);
    accepted.push(toOccupied(updated));
    changes.push({
      id: current.id,
      from: poseOf(current),
      to: poseOf(updated),
      reason,
    });
  }

  return { plan: next, changes };
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

function applyPlacement(plan: LevelPlan, updated: Placement): void {
  const index = plan.placements.findIndex((item) => item.id === updated.id);
  if (index >= 0) {
    plan.placements[index] = updated;
  }
}

function poseOf(placement: Placement): SnapPose {
  const pose: SnapPose = {
    surface: placement.surface,
    u: placement.u,
    v: placement.v,
  };
  if (placement.to !== undefined) {
    pose.to = placement.to;
  }
  return pose;
}

function toOccupied(placement: Placement): Occupied {
  return {
    id: placement.id,
    surface: placement.surface,
    u: placement.u,
    v: placement.v,
    piece: placement.piece,
  };
}

function invalidReason(
  placement: Placement,
  nodes: NodeIndex,
  graph: SurfaceGraph,
  accepted: readonly Occupied[],
  plan: LevelPlan
): string | null {
  const surface = nodes.get(placement.surface);
  if (!surface) {
    return null;
  }
  if (!Number.isFinite(placement.u) || !Number.isFinite(placement.v)) {
    return 'non-finite u/v';
  }
  if (placement.u < 0 || placement.u > 1 || placement.v < 0 || placement.v > 1) {
    return 'u/v out of bounds';
  }
  if (placement.piece === 'village_hut' && placement.surface !== plan.start) {
    return 'hut not on start';
  }
  if (placement.piece === 'crystal_shrine' && placement.surface !== plan.goal) {
    return 'shrine not on goal';
  }
  if (!pieceFitsSurface(placement.piece, surface)) {
    return 'surface does not fit piece';
  }
  if (
    placement.piece === 'gem' ||
    placement.piece === 'gate' ||
    placement.piece === 'slime'
  ) {
    const path = onPathIds(plan, graph, nodes);
    if (path.length > 0 && !path.includes(placement.surface)) {
      return 'not on path';
    }
  }
  if (LINK_PIECES.has(placement.piece)) {
    const toId = placement.to;
    if (!toId || toId === placement.surface || !nodes.has(toId)) {
      return 'invalid surface pair';
    }
    const toNode = nodes.get(toId);
    if (!toNode || pairKindBonus(placement.piece, surface, toNode, graph) < 3) {
      return 'invalid surface pair';
    }
    const reachable = reachableWithout(placement.id, plan, graph, nodes);
    if (!helpsReach(surface.id, toId, reachable)) {
      const alt = connectorSurfaces(placement, plan, graph, nodes);
      if (alt.some((node) => helpsReach(node.id, toId, reachable))) {
        return 'pair does not restore reachability';
      }
    }
  }
  const range = pieceUvRange(surface, placement.piece);
  if (!range) {
    return 'surface too small for footprint';
  }
  if (!uvInside(placement.u, placement.v, range)) {
    return 'u/v outside usable range';
  }
  if (overlapsAccepted(placement, surface, accepted, nodes)) {
    return 'footprint overlap';
  }
  return null;
}

function overlapsAccepted(
  placement: Placement,
  surface: SurfaceNode,
  accepted: readonly Occupied[],
  nodes: NodeIndex
): boolean {
  const fp = orientedFootprint(surface, placement.piece);
  if (!fp) {
    return false;
  }
  const self = { u: placement.u, v: placement.v, fp };
  for (const other of accepted) {
    if (other.surface !== placement.surface || other.id === placement.id) {
      continue;
    }
    const otherNode = nodes.get(other.surface);
    if (!otherNode) {
      continue;
    }
    const otherFp = orientedFootprint(otherNode, other.piece);
    if (!otherFp) {
      continue;
    }
    if (
      footprintsOverlap(self, { u: other.u, v: other.v, fp: otherFp }, surface)
    ) {
      return true;
    }
  }
  return false;
}

function moveToSlot(
  placement: Placement,
  plan: LevelPlan,
  graph: SurfaceGraph,
  nodes: NodeIndex,
  accepted: readonly Occupied[],
  reason: string
): SnapPose | null {
  const candidates = candidateSurfaces(placement, plan, graph, nodes);
  let best: { pose: SnapPose; score: number; surfaceId: string } | null = null;
  const fromNode = nodes.get(placement.surface);

  for (const surface of candidates) {
    const slots = listSlotsForPiece(surface, placement.piece);
    const fp = orientedFootprint(surface, placement.piece);
    if (!fp) {
      continue;
    }
    for (const slot of slots) {
      if (slotTaken(surface, placement.piece, slot, accepted, nodes, placement.id)) {
        continue;
      }
      const [u, v] = quantizeUv(slot[0], slot[1]);
      const pose = poseFor(placement, surface.id, u, v, nodes, graph);
      if (!pose) {
        continue;
      }
      const score = slotScore(placement, surface, u, v, fromNode);
      if (
        !best ||
        score < best.score - 1e-12 ||
        (Math.abs(score - best.score) <= 1e-12 &&
          (surface.id.localeCompare(best.surfaceId) < 0 ||
            (surface.id === best.surfaceId &&
              (u < best.pose.u ||
                (u === best.pose.u && v < best.pose.v)))))
      ) {
        best = { pose, score, surfaceId: surface.id };
      }
    }
  }

  if (!best && reason === 'footprint overlap') {
    return null;
  }
  return best?.pose ?? null;
}

function poseFor(
  placement: Placement,
  surfaceId: string,
  u: number,
  v: number,
  nodes: NodeIndex,
  graph: SurfaceGraph
): SnapPose | null {
  const pose: SnapPose = { surface: surfaceId, u, v };
  if (!LINK_PIECES.has(placement.piece)) {
    return pose;
  }
  const from = nodes.get(surfaceId);
  if (!from) {
    return null;
  }
  const toId = pickTo(placement, from, graph, nodes);
  if (!toId) {
    return null;
  }
  pose.to = toId;
  return pose;
}

function pickTo(
  placement: Placement,
  from: SurfaceNode,
  graph: SurfaceGraph,
  nodes: NodeIndex
): string | null {
  const current = placement.to;
  if (current && current !== from.id) {
    const toNode = nodes.get(current);
    if (toNode && pairFitsPiece(placement.piece, from, toNode, graph)) {
      return current;
    }
  }
  const options: SurfaceNode[] = [];
  for (const node of graph.nodes) {
    if (node.id === from.id) {
      continue;
    }
    if (pairFitsPiece(placement.piece, from, node, graph)) {
      options.push(node);
    }
  }
  options.sort((a, b) => {
    const ka = pairKindBonus(placement.piece, from, a, graph);
    const kb = pairKindBonus(placement.piece, from, b, graph);
    if (ka !== kb) {
      return kb - ka;
    }
    const da = horizontalDistance(from, a);
    const db = horizontalDistance(from, b);
    return da - db || a.id.localeCompare(b.id);
  });
  return options[0]?.id ?? null;
}

function pairKindBonus(
  piece: PieceId,
  from: SurfaceNode,
  to: SurfaceNode,
  graph: SurfaceGraph
): number {
  const link = classifyPair(from, to, graph);
  if (!link) {
    return 0;
  }
  if (piece === 'plank_bridge' && link.kind === 'plank') {
    return 3;
  }
  if (piece === 'ramp' && link.kind === 'ramp') {
    return 3;
  }
  if (piece === 'portal' && link.kind === 'portal') {
    return 3;
  }
  return 1;
}

function slotTaken(
  surface: SurfaceNode,
  piece: PieceId,
  slot: readonly [number, number],
  accepted: readonly Occupied[],
  nodes: NodeIndex,
  selfId: string
): boolean {
  const fp = orientedFootprint(surface, piece);
  if (!fp) {
    return true;
  }
  const self = { u: slot[0], v: slot[1], fp };
  for (const other of accepted) {
    if (other.surface !== surface.id || other.id === selfId) {
      continue;
    }
    const otherNode = nodes.get(other.surface);
    if (!otherNode) {
      continue;
    }
    const otherFp = orientedFootprint(otherNode, other.piece);
    if (!otherFp) {
      continue;
    }
    if (
      footprintsOverlap(self, { u: other.u, v: other.v, fp: otherFp }, surface)
    ) {
      return true;
    }
  }
  return false;
}

function slotScore(
  placement: Placement,
  surface: SurfaceNode,
  u: number,
  v: number,
  fromNode: SurfaceNode | undefined
): number {
  const du = u - clampFinite(placement.u);
  const dv = v - clampFinite(placement.v);
  const uv = Math.hypot(du, dv);
  if (!fromNode || fromNode.id === surface.id) {
    return uv;
  }
  return 10 + horizontalDistance(fromNode, surface) + uv;
}

function clampFinite(value: number): number {
  return Number.isFinite(value) ? value : 0.5;
}

function isUsableSurface(
  piece: PieceId,
  node: SurfaceNode
): boolean {
  return pieceFitsSurface(piece, node) && orientedFootprint(node, piece) !== null;
}

function candidateSurfaces(
  placement: Placement,
  plan: LevelPlan,
  graph: SurfaceGraph,
  nodes: NodeIndex
): SurfaceNode[] {
  const usable = (id: string): SurfaceNode | undefined => {
    const node = nodes.get(id);
    if (!node || !isUsableSurface(placement.piece, node)) {
      return undefined;
    }
    return node;
  };

  if (placement.piece === 'village_hut') {
    const start = usable(plan.start);
    if (start) {
      return [start];
    }
    return graph.nodes
      .filter((node) => isUsableSurface(placement.piece, node))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  if (placement.piece === 'crystal_shrine') {
    const goal = usable(plan.goal);
    if (goal && goal.id !== plan.start) {
      return [goal];
    }
    return graph.nodes
      .filter(
        (node) => node.id !== plan.start && isUsableSurface(placement.piece, node)
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  if (
    placement.piece === 'gem' ||
    placement.piece === 'gate' ||
    placement.piece === 'slime'
  ) {
    const path = onPathIds(plan, graph, nodes)
      .map((id) => usable(id))
      .filter((node): node is SurfaceNode => node !== undefined);
    if (path.length > 0) {
      return path;
    }
  }

  if (LINK_PIECES.has(placement.piece)) {
    return connectorSurfaces(placement, plan, graph, nodes);
  }

  const current = usable(placement.surface);
  const rest = graph.nodes
    .filter((node) => node.id !== placement.surface)
    .filter((node) => isUsableSurface(placement.piece, node))
    .sort((a, b) => a.id.localeCompare(b.id));
  return current ? [current, ...rest] : rest;
}

function connectorSurfaces(
  placement: Placement,
  plan: LevelPlan,
  graph: SurfaceGraph,
  nodes: NodeIndex
): SurfaceNode[] {
  const toId = placement.to;
  const reachable = reachableWithout(placement.id, plan, graph, nodes);
  const matching: SurfaceNode[] = [];
  const other: SurfaceNode[] = [];
  for (const node of graph.nodes) {
    if (!isUsableSurface(placement.piece, node)) {
      continue;
    }
    if (toId && toId !== node.id) {
      const toNode = nodes.get(toId);
      if (toNode && pairFitsPiece(placement.piece, node, toNode, graph)) {
        const bonus = pairKindBonus(placement.piece, node, toNode, graph);
        if (bonus >= 3) {
          matching.push(node);
          continue;
        }
        other.push(node);
        continue;
      }
    }
    other.push(node);
  }
  const rank = (a: SurfaceNode, b: SurfaceNode): number => {
    const ha = helpsReach(a.id, toId, reachable);
    const hb = helpsReach(b.id, toId, reachable);
    if (ha !== hb) {
      return hb - ha;
    }
    return a.id.localeCompare(b.id);
  };
  matching.sort(rank);
  other.sort(rank);
  const helpful = matching.filter((node) => helpsReach(node.id, toId, reachable));
  if (helpful.length > 0) {
    return helpful;
  }
  if (matching.length > 0) {
    return matching;
  }
  return other;
}

function reachableWithout(
  skipId: string,
  plan: LevelPlan,
  graph: SurfaceGraph,
  nodes: NodeIndex
): Set<string> {
  if (!nodes.has(plan.start)) {
    return new Set<string>();
  }
  const builtIds = new Set(
    plan.placements
      .filter((item) => LINK_PIECES.has(item.piece) && item.id !== skipId)
      .map((item) => item.id)
  );
  const adj = explorerAdjacency(plan, graph, {
    builtIds,
    openGateIds: new Set<string>(),
  });
  return bfsReachable(plan.start, adj);
}

function helpsReach(
  fromId: string,
  toId: string | undefined,
  reachable: ReadonlySet<string>
): number {
  if (!toId) {
    return 0;
  }
  const fromR = reachable.has(fromId);
  const toR = reachable.has(toId);
  if (fromR === toR) {
    return 0;
  }
  return toId && (fromR || toR) ? 1 : 0;
}

function onPathIds(
  plan: LevelPlan,
  graph: SurfaceGraph,
  nodes: NodeIndex
): string[] {
  if (!nodes.has(plan.start) || !nodes.has(plan.goal)) {
    return [];
  }
  const builtIds = new Set(
    plan.placements
      .filter((item) => LINK_PIECES.has(item.piece))
      .map((item) => item.id)
  );
  const openGateIds = new Set<string>();
  for (const item of plan.placements) {
    if (item.piece !== 'lever') {
      continue;
    }
    const surface = nodes.get(item.surface);
    if (!surface) {
      continue;
    }
    for (const link of item.links) {
      openGateIds.add(link);
    }
  }
  const adj = explorerAdjacency(plan, graph, { builtIds, openGateIds });
  const reachable = bfsReachable(plan.start, adj);
  if (!reachable.has(plan.goal)) {
    return [...reachable].sort((a, b) => a.localeCompare(b));
  }
  return [...nodesOnSomePath(plan.start, plan.goal, adj)].sort((a, b) =>
    a.localeCompare(b)
  );
}
