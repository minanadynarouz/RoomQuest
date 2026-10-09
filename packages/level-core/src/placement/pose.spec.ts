import { describe, it, expect } from 'vitest';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import type { SurfaceGraph, SurfaceNode } from '@roomquest/schema';
import { placementToPose, SURFACE_INSET_M } from './pose';

const EPS = 1e-9;

function graphWith(overrides: Partial<SurfaceNode> = {}): SurfaceGraph {
  return {
    version: 1,
    roomHash: 'aaaaaaaaaaaa',
    mode: 'scene',
    floorY: 0,
    nodes: [
      {
        id: 's1',
        label: 'table',
        kind: 'plane',
        topHeight: 0.8,
        centroid: [1, 0.8, -2],
        size: [1.0, 0.6],
        yaw: 0,
        area: 0.6,
        reach: 'hand',
        angleFromForward: 0,
        ...overrides,
      },
      {
        id: 's2',
        label: 'couch',
        kind: 'mesh',
        topHeight: 0.4,
        centroid: [3, 0.4, -2],
        size: [2.0, 0.9],
        yaw: 0,
        area: 1.8,
        reach: 'ray',
        angleFromForward: 20,
      },
    ],
    edges: [],
  };
}

describe('placementToPose', () => {
  it('maps the centre (u=0.5, v=0.5) to the centroid xz and the surface top', () => {
    const graph = graphWith();
    const pose = placementToPose(graph, { surface: 's1', u: 0.5, v: 0.5 });
    expect(pose.position[0]).toBeCloseTo(1, 10);
    expect(pose.position[2]).toBeCloseTo(-2, 10);
    expect(pose.position[1]).toBeCloseTo(0.8, 10);
    expect(pose.yaw).toBe(0);
  });

  it('places y on the surface top (floorY + topHeight) within 2 cm', () => {
    const graph = graphWith({ topHeight: 0.75, centroid: [0, 0.75, 0] });
    graph.floorY = 0.02;
    const pose = placementToPose(graph, { surface: 's1', u: 0.5, v: 0.5 });
    const top = graph.floorY + 0.75;
    expect(Math.abs(pose.position[1] - top)).toBeLessThan(0.02);
    expect(pose.position[1]).toBeCloseTo(top, 10);
  });

  it('insets corners 3 cm from each edge at yaw 0', () => {
    const graph = graphWith({
      centroid: [0, 0.8, 0],
      size: [1.0, 0.6],
      yaw: 0,
    });
    const width = 1.0;
    const depth = 0.6;

    const sw = placementToPose(graph, { surface: 's1', u: 0, v: 0 });
    expect(sw.position[0]).toBeCloseTo(-width / 2 + SURFACE_INSET_M, 10);
    expect(sw.position[2]).toBeCloseTo(-depth / 2 + SURFACE_INSET_M, 10);

    const se = placementToPose(graph, { surface: 's1', u: 1, v: 0 });
    expect(se.position[0]).toBeCloseTo(width / 2 - SURFACE_INSET_M, 10);
    expect(se.position[2]).toBeCloseTo(-depth / 2 + SURFACE_INSET_M, 10);

    const nw = placementToPose(graph, { surface: 's1', u: 0, v: 1 });
    expect(nw.position[0]).toBeCloseTo(-width / 2 + SURFACE_INSET_M, 10);
    expect(nw.position[2]).toBeCloseTo(depth / 2 - SURFACE_INSET_M, 10);

    const ne = placementToPose(graph, { surface: 's1', u: 1, v: 1 });
    expect(ne.position[0]).toBeCloseTo(width / 2 - SURFACE_INSET_M, 10);
    expect(ne.position[2]).toBeCloseTo(depth / 2 - SURFACE_INSET_M, 10);
  });

  it('clamps u,v outside [0,1] to the inset corners', () => {
    const graph = graphWith({
      centroid: [0, 0.8, 0],
      size: [1.0, 0.6],
      yaw: 0,
    });
    const clamped = placementToPose(graph, { surface: 's1', u: -2, v: 4 });
    const corner = placementToPose(graph, { surface: 's1', u: 0, v: 1 });
    expect(clamped.position[0]).toBeCloseTo(corner.position[0], 10);
    expect(clamped.position[2]).toBeCloseTo(corner.position[2], 10);
  });

  it('collapses UV to the centroid when the face is smaller than 2× inset', () => {
    const graph = graphWith({
      centroid: [5, 0.5, 7],
      size: [0.04, 0.05],
      topHeight: 0.5,
    });
    const pose = placementToPose(graph, { surface: 's1', u: 0, v: 1 });
    expect(pose.position[0]).toBeCloseTo(5, 10);
    expect(pose.position[2]).toBeCloseTo(7, 10);
  });

  it('rotates the UV offset by surface yaw about Y', () => {
    const yaw = Math.PI / 2;
    const graph = graphWith({
      centroid: [0, 0.8, 0],
      size: [1.0, 0.6],
      yaw,
    });
    // u=1, v=0.5 → localX = +(0.5 - inset) along width, localZ = 0
    // yaw = π/2: x' = localX cos - localZ sin = 0, z' = localX sin + localZ cos = localX
    const pose = placementToPose(graph, { surface: 's1', u: 1, v: 0.5 });
    const localX = 0.5 - SURFACE_INSET_M;
    expect(pose.position[0]).toBeCloseTo(0, 10);
    expect(pose.position[2]).toBeCloseTo(localX, 10);
    expect(pose.yaw).toBeCloseTo(yaw, 10);

    const alongDepth = placementToPose(graph, { surface: 's1', u: 0.5, v: 1 });
    const localZ = 0.3 - SURFACE_INSET_M;
    expect(alongDepth.position[0]).toBeCloseTo(-localZ, 10);
    expect(alongDepth.position[2]).toBeCloseTo(0, 10);
  });

  it('places the fixture coffee-table centre on its top within 2 cm', () => {
    const pose = placementToPose(SYNTHETIC_LIVING_ROOM, {
      surface: 's1',
      u: 0.5,
      v: 0.5,
    });
    const node = SYNTHETIC_LIVING_ROOM.nodes.find((n) => n.id === 's1');
    expect(node).toBeDefined();
    if (!node) return;
    const top = SYNTHETIC_LIVING_ROOM.floorY + node.topHeight;
    expect(Math.abs(pose.position[1] - top)).toBeLessThan(0.02);
    expect(pose.position[0]).toBeCloseTo(node.centroid[0], 10);
    expect(pose.position[2]).toBeCloseTo(node.centroid[2], 10);
  });

  it('throws for an unknown surface id', () => {
    expect(() =>
      placementToPose(graphWith(), { surface: 's9', u: 0.5, v: 0.5 })
    ).toThrow(/Unknown surface/);
  });

  it('keeps the inset distance exactly SURFACE_INSET_M from the raw edge', () => {
    const graph = graphWith({ centroid: [0, 0.8, 0], size: [2, 1], yaw: 0 });
    const pose = placementToPose(graph, { surface: 's1', u: 0, v: 0.5 });
    const leftEdge = -1;
    expect(pose.position[0] - leftEdge).toBeCloseTo(SURFACE_INSET_M, 10);
    expect(
      Math.abs(pose.position[0] - leftEdge - SURFACE_INSET_M)
    ).toBeLessThan(EPS);
  });
});
