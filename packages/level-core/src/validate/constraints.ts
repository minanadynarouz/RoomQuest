import {
  isPieceId,
  KIT_CATALOG,
  type LevelPlan,
  type Placement,
  type SurfaceGraph,
  type SurfaceNode,
} from '@roomquest/schema';
import {
  graphCanSeparateHutAndShrine,
  graphHasCatalogHut,
  graphHasPlayableView,
  graphHasTableLike,
  isTableLike,
} from './graph-capacity';
import {
  findEdge,
  formatNum,
  GEOM_EPS_M,
  horizontalDistance,
  indexNodes,
  isPlayerReachable,
  MAX_VIEW_ANGLE_DEG,
  MIN_PATH_DISTANCE_M,
  pairMetrics,
  type NodeIndex,
} from './graph-utils';
import { issue, type Issue } from './types';

/**
 * Per-piece KIT_CATALOG checks against the graph (PRD §4.2).
 * Collects every issue rather than failing fast so a repair call sees
 * the full list.
 */
export function checkConstraints(
  plan: LevelPlan,
  graph: SurfaceGraph,
  issues: Issue[]
): void {
  const nodes = indexNodes(graph);
  const counts = new Map<string, number>();

  checkStartGoalSurfaces(plan, nodes, issues);
  checkHutAndShrine(plan, graph, nodes, issues);

  for (const placement of plan.placements) {
    counts.set(placement.piece, (counts.get(placement.piece) ?? 0) + 1);
    checkPlacement(placement, plan, graph, nodes, issues);
  }

  for (const [piece, count] of counts) {
    if (!isPieceId(piece)) {
      continue;
    }
    const constraints = KIT_CATALOG[piece];
    const max = constraints.maxPerLevel;
    if (max !== undefined && count > max) {
      issues.push(
        issue(
          'TOO_MANY_OF_PIECE',
          `${piece} appears ${String(count)} times; max is ${String(max)}`
        )
      );
    }
  }
}

function checkStartGoalSurfaces(
  plan: LevelPlan,
  nodes: NodeIndex,
  issues: Issue[]
): void {
  if (!nodes.has(plan.start)) {
    issues.push(
      issue(
        'UNKNOWN_SURFACE',
        `start surface "${plan.start}" is not in the graph`,
        { surfaceId: plan.start }
      )
    );
  }
  if (!nodes.has(plan.goal)) {
    issues.push(
      issue(
        'UNKNOWN_SURFACE',
        `goal surface "${plan.goal}" is not in the graph`,
        { surfaceId: plan.goal }
      )
    );
  }
  if (plan.start === plan.goal) {
    issues.push(
      issue('START_EQUALS_GOAL', `start and goal are both "${plan.start}"`, {
        surfaceId: plan.start,
      })
    );
  }
}

function checkHutAndShrine(
  plan: LevelPlan,
  graph: SurfaceGraph,
  nodes: NodeIndex,
  issues: Issue[]
): void {
  const hut = plan.placements.find((p) => p.piece === 'village_hut');
  const shrine = plan.placements.find((p) => p.piece === 'crystal_shrine');

  if (!hut) {
    issues.push(
      issue('MISSING_START_HUT', 'plan has no village_hut placement')
    );
  } else if (hut.surface !== plan.start) {
    issues.push(
      issue(
        'HUT_NOT_ON_START',
        `village_hut ${hut.id} is on ${hut.surface}, start is ${plan.start}`,
        { placementId: hut.id, surfaceId: hut.surface }
      )
    );
  }

  if (!shrine) {
    issues.push(
      issue('MISSING_GOAL_SHRINE', 'plan has no crystal_shrine placement')
    );
  } else if (shrine.surface !== plan.goal) {
    issues.push(
      issue(
        'SHRINE_NOT_ON_GOAL',
        `crystal_shrine ${shrine.id} is on ${shrine.surface}, goal is ${plan.goal}`,
        { placementId: shrine.id, surfaceId: shrine.surface }
      )
    );
  }

  if (hut?.surface === shrine?.surface && hut && shrine) {
    const already = issues.some((i) => i.code === 'START_EQUALS_GOAL');
    if (!already) {
      issues.push(
        issue(
          'START_EQUALS_GOAL',
          `hut ${hut.id} and shrine ${shrine.id} share surface ${hut.surface}`,
          { surfaceId: hut.surface }
        )
      );
    }
  }

  if (hut && shrine && graphCanSeparateHutAndShrine(graph)) {
    const from = nodes.get(hut.surface);
    const to = nodes.get(shrine.surface);
    if (from && to && hut.surface !== shrine.surface) {
      const dist = horizontalDistance(from, to);
      if (dist < MIN_PATH_DISTANCE_M) {
        issues.push(
          issue(
            'PATH_DISTANCE_TOO_SHORT',
            `hut→shrine distance ${formatNum(dist)}m < ${String(MIN_PATH_DISTANCE_M)}m`,
            { placementId: shrine.id, surfaceId: shrine.surface }
          )
        );
      }
    }
  }
}

function checkPlacement(
  placement: Placement,
  plan: LevelPlan,
  graph: SurfaceGraph,
  nodes: NodeIndex,
  issues: Issue[]
): void {
  const catalog = KIT_CATALOG[placement.piece];
  const surface = nodes.get(placement.surface);

  if (!surface) {
    issues.push(
      issue(
        'UNKNOWN_SURFACE',
        `${placement.piece} ${placement.id} references unknown surface ${placement.surface}`,
        { placementId: placement.id, surfaceId: placement.surface }
      )
    );
  } else {
    checkSurfaceFits(placement, surface, catalog, graph, issues);
  }

  if (catalog.requiresSecondSurface && !placement.to) {
    issues.push(
      issue(
        'MISSING_SECOND_SURFACE',
        `${placement.piece} ${placement.id} needs a "to" surface`,
        { placementId: placement.id, surfaceId: placement.surface }
      )
    );
  }

  if (placement.to) {
    if (placement.to === placement.surface) {
      issues.push(
        issue(
          'SAME_SURFACE_PAIR',
          `${placement.piece} ${placement.id} has to=${placement.to} equal to surface`,
          { placementId: placement.id, surfaceId: placement.surface }
        )
      );
    }
    const toNode = nodes.get(placement.to);
    if (!toNode) {
      issues.push(
        issue(
          'UNKNOWN_SURFACE',
          `${placement.piece} ${placement.id} references unknown "to" surface ${placement.to}`,
          { placementId: placement.id, surfaceId: placement.to }
        )
      );
    } else if (surface) {
      checkPair(placement, surface, toNode, graph, catalog, issues);
      if (placement.piece === 'portal' && graphHasPlayableView(graph)) {
        checkInView(placement, toNode, issues);
      }
    }
  }

  if (placement.piece === 'lever') {
    checkLever(placement, surface, plan, issues);
  }
  if (placement.piece === 'gate') {
    checkGateHasLever(placement, plan, issues);
  }
  if (placement.piece === 'ramp' && surface && placement.to) {
    const toNode = nodes.get(placement.to);
    if (toNode) {
      checkRampFloorRun(placement, surface, toNode, graph, issues);
    }
  }
}

function checkSurfaceFits(
  placement: Placement,
  surface: SurfaceNode,
  catalog: (typeof KIT_CATALOG)[keyof typeof KIT_CATALOG],
  graph: SurfaceGraph,
  issues: Issue[]
): void {
  const degradeHut =
    placement.piece === 'village_hut' && !graphHasCatalogHut(graph);
  if (degradeHut) {
    if (graphHasTableLike(graph) && !isTableLike(surface)) {
      issues.push(
        issue(
          'LABEL_NOT_ALLOWED',
          `${placement.piece} ${placement.id} cannot sit on ${surface.label} ${surface.id} (allowed: ${catalog.allowedSurfaces?.join('/') ?? 'any'})`,
          { placementId: placement.id, surfaceId: surface.id }
        )
      );
    }
    return;
  }

  if (
    catalog.allowedSurfaces &&
    !catalog.allowedSurfaces.includes(surface.label)
  ) {
    issues.push(
      issue(
        'LABEL_NOT_ALLOWED',
        `${placement.piece} ${placement.id} cannot sit on ${surface.label} ${surface.id} (allowed: ${catalog.allowedSurfaces.join('/')})`,
        { placementId: placement.id, surfaceId: surface.id }
      )
    );
  }

  if (
    catalog.minHeight !== undefined &&
    surface.topHeight < catalog.minHeight
  ) {
    issues.push(
      issue(
        'HEIGHT_OUT_OF_RANGE',
        `${placement.piece} ${placement.id} height ${formatNum(surface.topHeight)}m < min ${String(catalog.minHeight)}m on ${surface.id}`,
        { placementId: placement.id, surfaceId: surface.id }
      )
    );
  }
  if (
    catalog.maxHeight !== undefined &&
    surface.topHeight > catalog.maxHeight
  ) {
    issues.push(
      issue(
        'HEIGHT_OUT_OF_RANGE',
        `${placement.piece} ${placement.id} height ${formatNum(surface.topHeight)}m > max ${String(catalog.maxHeight)}m on ${surface.id}`,
        { placementId: placement.id, surfaceId: surface.id }
      )
    );
  }

  if (catalog.minArea !== undefined && surface.area < catalog.minArea) {
    issues.push(
      issue(
        'AREA_TOO_SMALL',
        `${placement.piece} ${placement.id} needs area ≥ ${String(catalog.minArea)}m²; ${surface.id} is ${formatNum(surface.area)}m²`,
        { placementId: placement.id, surfaceId: surface.id }
      )
    );
  }

  const maxAngle = catalog.maxAngleFromForward ?? undefined;
  if (maxAngle !== undefined && surface.angleFromForward > maxAngle) {
    issues.push(
      issue(
        'SLOPE_TOO_STEEP',
        `${placement.piece} ${placement.id} on ${surface.id} is ${String(surface.angleFromForward)}° from forward (max ${String(maxAngle)}°, > ${String(MAX_VIEW_ANGLE_DEG)}° is out of view)`,
        { placementId: placement.id, surfaceId: surface.id }
      )
    );
  }

  if (placement.piece === 'lever' && !isPlayerReachable(surface)) {
    issues.push(
      issue(
        'OUT_OF_REACH',
        `lever ${placement.id} on ${surface.id} has reach "${surface.reach}"; need hand or ray`,
        { placementId: placement.id, surfaceId: surface.id }
      )
    );
  }
}

function checkPair(
  placement: Placement,
  from: SurfaceNode,
  to: SurfaceNode,
  graph: SurfaceGraph,
  catalog: (typeof KIT_CATALOG)[keyof typeof KIT_CATALOG],
  issues: Issue[]
): void {
  const edge = findEdge(graph, from.id, to.id);
  const { gap, dh } = pairMetrics(from, to, edge);

  if (catalog.minGap !== undefined && gap < catalog.minGap - GEOM_EPS_M) {
    issues.push(
      issue(
        'GAP_TOO_NARROW',
        `${placement.piece} ${placement.id} gap ${formatNum(gap)}m < min ${String(catalog.minGap)}m (${from.id}–${to.id})`,
        { placementId: placement.id, surfaceId: from.id }
      )
    );
  }
  if (catalog.maxGap !== undefined && gap > catalog.maxGap + GEOM_EPS_M) {
    issues.push(
      issue(
        'GAP_TOO_WIDE',
        `${placement.piece} ${placement.id} gap ${formatNum(gap)}m > max ${String(catalog.maxGap)}m (${from.id}–${to.id})`,
        { placementId: placement.id, surfaceId: from.id }
      )
    );
  }
  if (
    catalog.maxDeltaHeight !== undefined &&
    dh > catalog.maxDeltaHeight + GEOM_EPS_M
  ) {
    issues.push(
      issue(
        'DELTA_HEIGHT_TOO_LARGE',
        `${placement.piece} ${placement.id} |Δh| ${formatNum(dh)}m > max ${String(catalog.maxDeltaHeight)}m (${from.id}–${to.id})`,
        { placementId: placement.id, surfaceId: from.id }
      )
    );
  }
}

function checkInView(
  placement: Placement,
  node: SurfaceNode,
  issues: Issue[]
): void {
  if (node.angleFromForward > MAX_VIEW_ANGLE_DEG) {
    issues.push(
      issue(
        'SLOPE_TOO_STEEP',
        `${placement.piece} ${placement.id} "to" ${node.id} is ${String(node.angleFromForward)}° from forward (max ${String(MAX_VIEW_ANGLE_DEG)}°)`,
        { placementId: placement.id, surfaceId: node.id }
      )
    );
  }
}

function checkLever(
  placement: Placement,
  _surface: SurfaceNode | undefined,
  plan: LevelPlan,
  issues: Issue[]
): void {
  if (placement.links.length === 0) {
    issues.push(
      issue('INVALID_LINK', `lever ${placement.id} links no gates`, {
        placementId: placement.id,
      })
    );
    return;
  }
  const byId = new Map(plan.placements.map((p) => [p.id, p]));
  for (const link of placement.links) {
    const target = byId.get(link);
    if (!target) {
      issues.push(
        issue(
          'UNKNOWN_PLACEMENT_REF',
          `lever ${placement.id} links unknown placement ${link}`,
          { placementId: placement.id }
        )
      );
    } else if (target.piece !== 'gate') {
      issues.push(
        issue(
          'INVALID_LINK',
          `lever ${placement.id} links ${link} (${target.piece}), expected a gate`,
          { placementId: placement.id }
        )
      );
    }
  }
}

function checkGateHasLever(
  placement: Placement,
  plan: LevelPlan,
  issues: Issue[]
): void {
  const linked = plan.placements.some(
    (p) => p.piece === 'lever' && p.links.includes(placement.id)
  );
  if (!linked) {
    issues.push(
      issue(
        'GATE_WITHOUT_LEVER',
        `gate ${placement.id} has no lever linking to it`,
        { placementId: placement.id, surfaceId: placement.surface }
      )
    );
  }
}

/** Ramp free floor run must be at least this times |Δh| (PRD §4.2). */
export const RAMP_FLOOR_RUN_FACTOR = 2;

/**
 * Ramp: free floor run ≥ {@link RAMP_FLOOR_RUN_FACTOR}×|Δh| (PRD §4.2).
 * Prefer a floor node's smaller top-face dimension; otherwise use the pair gap.
 */
function checkRampFloorRun(
  placement: Placement,
  from: SurfaceNode,
  to: SurfaceNode,
  graph: SurfaceGraph,
  issues: Issue[]
): void {
  const catalog = KIT_CATALOG.ramp;
  const edge = findEdge(graph, from.id, to.id);
  const { gap, dh } = pairMetrics(from, to, edge);
  if (
    catalog.maxDeltaHeight !== undefined &&
    dh > catalog.maxDeltaHeight + GEOM_EPS_M
  ) {
    return; // already reported as DELTA_HEIGHT_TOO_LARGE
  }
  const floor =
    from.label === 'floor' ? from : to.label === 'floor' ? to : null;
  const run = floor
    ? Math.max(gap, Math.min(floor.size[0], floor.size[1]))
    : gap;
  const needed = RAMP_FLOOR_RUN_FACTOR * dh;
  if (run < needed) {
    issues.push(
      issue(
        'FLOOR_RUN_TOO_SHORT',
        `ramp ${placement.id} needs floor run ≥ ${formatNum(needed)}m (2×Δh); got ${formatNum(run)}m`,
        { placementId: placement.id, surfaceId: from.id }
      )
    );
  }
}
