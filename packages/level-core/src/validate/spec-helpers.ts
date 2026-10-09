import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import type {
  LevelPlan,
  Placement,
  SurfaceEdge,
  SurfaceGraph,
  SurfaceNode,
} from '@roomquest/schema';
import type { IssueCode, ValidationResult } from './types';

export const PLAN: LevelPlan = SYNTHETIC_LIVING_ROOM_PLAN;
export const GRAPH: SurfaceGraph = SYNTHETIC_LIVING_ROOM;

export function codesOf(result: ValidationResult): IssueCode[] {
  return result.issues.map((item) => item.code);
}

export function withPlacement(
  id: string,
  patch: Partial<Placement>
): LevelPlan {
  return {
    ...PLAN,
    placements: PLAN.placements.map((placement) =>
      placement.id === id ? { ...placement, ...patch } : placement
    ),
  };
}

export function replacePiece(id: string, next: Placement): LevelPlan {
  return {
    ...PLAN,
    placements: PLAN.placements.map((placement) =>
      placement.id === id ? next : placement
    ),
  };
}

export function withNode(
  id: string,
  patch: Partial<SurfaceNode>
): SurfaceGraph {
  return {
    ...GRAPH,
    nodes: GRAPH.nodes.map((node) =>
      node.id === id ? { ...node, ...patch } : node
    ),
  };
}

export function withEdge(
  a: string,
  b: string,
  patch: Partial<Pick<SurfaceEdge, 'gap' | 'dh' | 'kind'>>
): SurfaceGraph {
  return {
    ...GRAPH,
    edges: GRAPH.edges.map((edge) => {
      const match =
        (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a);
      return match ? { ...edge, ...patch } : edge;
    }),
  };
}

export function extraPlacement(placement: Placement): LevelPlan {
  return {
    ...PLAN,
    placements: [...PLAN.placements, placement],
  };
}
