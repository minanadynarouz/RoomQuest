import type { SurfaceGraph, SurfaceNode } from '@roomquest/schema';

/**
 * Detected surfaces, largest area first. Equal areas sort by `id`
 * so the sweep order is stable across scans.
 */
export function orderSurfacesByArea(graph: SurfaceGraph): string[] {
  const nodes = graph.nodes.slice();
  nodes.sort(compareSurfaceAreaThenId);
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
  }
  return ids;
}

function compareSurfaceAreaThenId(a: SurfaceNode, b: SurfaceNode): number {
  if (b.area !== a.area) {
    return b.area - a.area;
  }
  if (a.id < b.id) {
    return -1;
  }
  if (a.id > b.id) {
    return 1;
  }
  return 0;
}
