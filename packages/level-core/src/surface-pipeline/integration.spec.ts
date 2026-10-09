import { describe, it, expect } from 'vitest';
import { buildSurfaceGraph } from './pipeline';
import type { SurfaceDescriptor } from './types';

describe('Integration: Native-shaped Input', () => {
  const defaultStartPose = {
    position: [0, 1.7, 0] as [number, number, number],
    forward: [0, 0, -1] as [number, number, number],
  };

  it('handles polygon-only plane with semanticLabel', async () => {
    const tablePolygon: [number, number, number][] = [
      [-0.5, 0, -0.3],
      [0.5, 0, -0.3],
      [0.5, 0, 0.3],
      [-0.5, 0, 0.3],
    ];

    const descriptors: SurfaceDescriptor[] = [
      {
        type: 'plane',
        label: 'table',
        orientation: 'horizontal',
        pose: {
          position: [0, 0.75, -1],
          orientation: [0, 0, 0, 1],
        },
        polygon: tablePolygon,
      },
      {
        type: 'plane',
        label: 'floor',
        orientation: 'horizontal',
        pose: {
          position: [0, 0, 0],
          orientation: [0, 0, 0, 1],
        },
        polygon: [
          [-2, 0, -2],
          [2, 0, -2],
          [2, 0, 2],
          [-2, 0, 2],
        ],
      },
    ];

    const graph = await buildSurfaceGraph(descriptors, 0, defaultStartPose);

    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    expect(graph.nodes.length).toBeLessThanOrEqual(12);

    const tableNode = graph.nodes.find((n) => n.label === 'table');
    expect(tableNode).toBeDefined();
    if (tableNode) {
      expect(tableNode.topHeight).toBeCloseTo(0.75, 1);
      expect(tableNode.area).toBeGreaterThan(0.5);
      expect(tableNode.size[0]).toBeGreaterThan(0.9);
      expect(tableNode.size[1]).toBeGreaterThan(0.5);
    }

    const floorNode = graph.nodes.find((n) => n.label === 'floor');
    expect(floorNode).toBeDefined();
    if (floorNode) {
      expect(floorNode.topHeight).toBeLessThan(0.1);
      expect(floorNode.area).toBeGreaterThan(10);
    }
  });

  it('handles bounded mesh with correct top height', async () => {
    const descriptors: SurfaceDescriptor[] = [
      {
        type: 'mesh',
        label: 'couch',
        isBounded: true,
        pose: {
          position: [0, 0.45, -2],
          orientation: [0, 0, 0, 1],
        },
        bounds: {
          min: [-1, -0.25, -0.45],
          max: [1, 0.25, 0.45],
        },
      },
      {
        type: 'plane',
        label: 'floor',
        orientation: 'horizontal',
        pose: {
          position: [0, 0, 0],
          orientation: [0, 0, 0, 1],
        },
        polygon: [
          [-3, 0, -3],
          [3, 0, -3],
          [3, 0, 3],
          [-3, 0, 3],
        ],
      },
    ];

    const graph = await buildSurfaceGraph(descriptors, 0, defaultStartPose);

    const couchNode = graph.nodes.find((n) => n.label === 'couch');
    expect(couchNode).toBeDefined();
    if (couchNode) {
      expect(couchNode.topHeight).toBeCloseTo(0.45, 1);
      expect(couchNode.area).toBeGreaterThan(1.5);
    }
  });

  it('computes correct polygon area with shoelace formula', async () => {
    const trianglePolygon: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
    ];

    const descriptors: SurfaceDescriptor[] = [
      {
        type: 'plane',
        label: 'other',
        orientation: 'horizontal',
        pose: {
          position: [0, 0.5, -1],
          orientation: [0, 0, 0, 1],
        },
        polygon: trianglePolygon,
      },
      {
        type: 'plane',
        label: 'floor',
        orientation: 'horizontal',
        pose: {
          position: [0, 0, 0],
          orientation: [0, 0, 0, 1],
        },
        polygon: [
          [-2, 0, -2],
          [2, 0, -2],
          [2, 0, 2],
          [-2, 0, 2],
        ],
      },
    ];

    const graph = await buildSurfaceGraph(descriptors, 0, defaultStartPose);

    const triangleNode = graph.nodes.find(
      (n) => n.topHeight > 0.4 && n.topHeight < 0.6,
    );
    expect(triangleNode).toBeDefined();
    if (triangleNode) {
      expect(triangleNode.area).toBeCloseTo(0.5, 1);
    }
  });

  it('maintains all acceptance criteria with realistic input', async () => {
    const descriptors: SurfaceDescriptor[] = [
      {
        type: 'plane',
        label: 'table',
        orientation: 'horizontal',
        pose: { position: [0, 0.75, -1], orientation: [0, 0, 0, 1] },
        polygon: [
          [-0.5, 0, -0.3],
          [0.5, 0, -0.3],
          [0.5, 0, 0.3],
          [-0.5, 0, 0.3],
        ],
      },
      {
        type: 'mesh',
        label: 'couch',
        isBounded: true,
        pose: { position: [0, 0.45, -2.5], orientation: [0, 0, 0, 1] },
        bounds: { min: [-1, -0.25, -0.45], max: [1, 0.25, 0.45] },
      },
      {
        type: 'plane',
        label: 'desk',
        orientation: 'horizontal',
        pose: { position: [1.5, 0.7, -1], orientation: [0, 0, 0, 1] },
        polygon: [
          [-0.6, 0, -0.4],
          [0.6, 0, -0.4],
          [0.6, 0, 0.4],
          [-0.6, 0, 0.4],
        ],
      },
      {
        type: 'plane',
        label: 'floor',
        orientation: 'horizontal',
        pose: { position: [0, 0, 0], orientation: [0, 0, 0, 1] },
        polygon: [
          [-3, 0, -3],
          [3, 0, -3],
          [3, 0, 3],
          [-3, 0, 3],
        ],
      },
    ];

    const graph = await buildSurfaceGraph(descriptors, 0, defaultStartPose);
    const samples: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const start = performance.now();
      await buildSurfaceGraph(descriptors, 0, defaultStartPose);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)] ?? 0;
    console.log(`native-shaped buildSurfaceGraph median ${median.toFixed(3)} ms`);

    expect(graph.nodes.length).toBeLessThanOrEqual(12);
    expect(JSON.stringify(graph).length).toBeLessThan(2048);
    expect(median).toBeLessThan(250);

    const hash1 = graph.roomHash;
    const graph2 = await buildSurfaceGraph(descriptors, 0, defaultStartPose);
    expect(graph2.roomHash).toBe(hash1);
  });
});
