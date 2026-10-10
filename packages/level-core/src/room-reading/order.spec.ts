import { describe, expect, it } from 'vitest';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import type { SurfaceGraph, SurfaceNode } from '@roomquest/schema';
import { orderSurfacesByArea } from './order';

function node(
  partial: Partial<SurfaceNode> & Pick<SurfaceNode, 'id' | 'area'>
): SurfaceNode {
  return {
    label: 'table',
    kind: 'plane',
    topHeight: 0.7,
    centroid: [0, 0.7, 0],
    size: [1, 0.8],
    yaw: 0,
    reach: 'hand',
    angleFromForward: 0,
    ...partial,
  };
}

function graphOf(nodes: SurfaceNode[]): SurfaceGraph {
  return {
    version: 1,
    roomHash: 'aabbccddeeff',
    mode: 'scene',
    floorY: 0,
    nodes,
    edges: [],
  };
}

describe('orderSurfacesByArea', () => {
  it('sorts the living-room fixture largest-first, ties by id', () => {
    expect(orderSurfacesByArea(SYNTHETIC_LIVING_ROOM)).toEqual([
      's5',
      's2',
      's1',
      's3',
      's4',
    ]);
  });

  it('breaks equal area by id', () => {
    const graph = graphOf([
      node({ id: 's3', area: 1 }),
      node({ id: 's1', area: 1 }),
      node({ id: 's2', area: 2 }),
    ]);
    expect(orderSurfacesByArea(graph)).toEqual(['s2', 's1', 's3']);
  });
});
