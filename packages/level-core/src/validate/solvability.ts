import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import {
  bfsReachable,
  explorerAdjacency,
  indexNodes,
  indexPlacements,
  isPlayerReachable,
  nodesOnSomePath,
} from './graph-utils';
import { issue, type Issue } from './types';

/**
 * BFS solvability (design doc §6):
 * - goal reachable from start over adjacent + ramps + portals +
 *   player-built bridges (assumed built)
 * - gates open only when a linked lever is hand- or ray-reachable
 * - beats completable in order
 * - gems/gates with `mustBeOnPath` sit on some start→goal walk
 */
export function checkSolvability(
  plan: LevelPlan,
  graph: SurfaceGraph,
  issues: Issue[]
): void {
  const nodes = indexNodes(graph);
  const placements = indexPlacements(plan);

  checkDuplicateIds(plan, issues);
  checkBeatRefs(plan, placements, issues);

  const openGateIds = reachableOpenGates(plan, nodes);
  const allBuilt = new Set(
    plan.placements
      .filter(
        (p) =>
          p.piece === 'plank_bridge' ||
          p.piece === 'ramp' ||
          p.piece === 'portal'
      )
      .map((p) => p.id)
  );

  const adj = explorerAdjacency(plan, graph, {
    builtIds: allBuilt,
    openGateIds,
  });

  if (nodes.has(plan.start) && nodes.has(plan.goal)) {
    const reachable = bfsReachable(plan.start, adj);
    if (!reachable.has(plan.goal)) {
      issues.push(
        issue(
          'GOAL_UNREACHABLE',
          `goal ${plan.goal} is not reachable from start ${plan.start} with built links and reachable-lever gates`,
          { surfaceId: plan.goal }
        )
      );
    } else {
      const onPath = nodesOnSomePath(plan.start, plan.goal, adj);
      checkMustBeOnPath(plan, onPath, issues);
    }
  }

  checkBeatsInOrder(plan, graph, nodes, placements, issues);
}

function checkDuplicateIds(plan: LevelPlan, issues: Issue[]): void {
  const seen = new Set<string>();
  for (const placement of plan.placements) {
    if (seen.has(placement.id)) {
      issues.push(
        issue(
          'DUPLICATE_PLACEMENT_ID',
          `placement id "${placement.id}" is used more than once`,
          { placementId: placement.id }
        )
      );
    }
    seen.add(placement.id);
  }
}

function checkBeatRefs(
  plan: LevelPlan,
  placements: ReadonlyMap<string, { id: string }>,
  issues: Issue[]
): void {
  for (const [index, beat] of plan.beats.entries()) {
    for (const ref of beat.uses) {
      if (!placements.has(ref)) {
        issues.push(
          issue(
            'UNKNOWN_PLACEMENT_REF',
            `beat ${String(index + 1)} ("${beat.goal}") uses unknown placement ${ref}`
          )
        );
      }
    }
  }
}

function reachableOpenGates(
  plan: LevelPlan,
  nodes: ReturnType<typeof indexNodes>
): Set<string> {
  const open = new Set<string>();
  for (const placement of plan.placements) {
    if (placement.piece !== 'lever') {
      continue;
    }
    const surface = nodes.get(placement.surface);
    if (!surface || !isPlayerReachable(surface)) {
      continue;
    }
    for (const link of placement.links) {
      open.add(link);
    }
  }
  return open;
}

function checkMustBeOnPath(
  plan: LevelPlan,
  onPath: ReadonlySet<string>,
  issues: Issue[]
): void {
  for (const placement of plan.placements) {
    if (placement.piece !== 'gem' && placement.piece !== 'gate') {
      continue;
    }
    if (!onPath.has(placement.surface)) {
      issues.push(
        issue(
          'NOT_ON_PATH',
          `${placement.piece} ${placement.id} on ${placement.surface} is not on a start→goal path`,
          { placementId: placement.id, surfaceId: placement.surface }
        )
      );
    }
  }
}

function checkBeatsInOrder(
  plan: LevelPlan,
  graph: SurfaceGraph,
  nodes: ReturnType<typeof indexNodes>,
  placements: ReturnType<typeof indexPlacements>,
  issues: Issue[]
): void {
  const builtIds = new Set<string>();
  const openGateIds = new Set<string>();

  // Non-player-built links exist from the start.
  for (const placement of plan.placements) {
    const isLink =
      placement.piece === 'plank_bridge' ||
      placement.piece === 'ramp' ||
      placement.piece === 'portal';
    if (isLink && !placement.playerBuilt) {
      builtIds.add(placement.id);
    }
  }

  for (const [index, beat] of plan.beats.entries()) {
    const used = [];
    for (const ref of beat.uses) {
      const placement = placements.get(ref);
      if (placement) {
        used.push(placement);
      }
    }

    for (const placement of used) {
      const isLink =
        placement.piece === 'plank_bridge' ||
        placement.piece === 'ramp' ||
        placement.piece === 'portal';
      if (isLink) {
        builtIds.add(placement.id);
      }
      if (placement.piece === 'lever') {
        const surface = nodes.get(placement.surface);
        if (!surface || !isPlayerReachable(surface)) {
          issues.push(
            issue(
              'BEAT_NOT_COMPLETABLE',
              `beat ${String(index + 1)} ("${beat.goal}"): lever ${placement.id} is not hand/ray reachable`,
              { placementId: placement.id, surfaceId: placement.surface }
            )
          );
        } else {
          for (const link of placement.links) {
            openGateIds.add(link);
          }
        }
      }
    }

    for (const placement of used) {
      if (placement.piece !== 'gate') {
        continue;
      }
      if (!openGateIds.has(placement.id)) {
        issues.push(
          issue(
            'BEAT_NOT_COMPLETABLE',
            `beat ${String(index + 1)} ("${beat.goal}"): gate ${placement.id} is still closed (no reachable lever used yet)`,
            { placementId: placement.id, surfaceId: placement.surface }
          )
        );
      }
    }

    const adj = explorerAdjacency(plan, graph, { builtIds, openGateIds });
    const reachable = nodes.has(plan.start)
      ? bfsReachable(plan.start, adj)
      : new Set<string>();

    for (const placement of used) {
      const needsExplorer =
        placement.piece === 'crystal_shrine' ||
        placement.piece === 'gem' ||
        placement.piece === 'slime' ||
        placement.piece === 'village_hut';
      if (!needsExplorer) {
        continue;
      }
      if (!reachable.has(placement.surface)) {
        issues.push(
          issue(
            'BEAT_NOT_COMPLETABLE',
            `beat ${String(index + 1)} ("${beat.goal}"): explorer cannot reach ${placement.piece} ${placement.id} on ${placement.surface}`,
            { placementId: placement.id, surfaceId: placement.surface }
          )
        );
      }
    }
  }
}
