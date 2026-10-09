import { describe, it, expect } from 'vitest';
import { buildSurfaceGraph, processSurfaces, computeRoomHash } from './pipeline';
import type { SurfaceDescriptor } from './types';

/** L-02 budget. CI gates on 5× so slow runners don't flake. */
const GRAPH_BUILD_BUDGET_MS = 50;
const GRAPH_BUILD_CI_BOUND_MS = GRAPH_BUILD_BUDGET_MS * 5;
const GRAPH_BUILD_SAMPLES = 11;

describe('Surface Pipeline', () => {
  const defaultStartPose = {
    position: [0, 1.7, 0] as [number, number, number],
    forward: [0, 0, -1] as [number, number, number],
  };

  describe('processSurfaces', () => {
    it('filters out vertical planes', () => {
      const descriptors: SurfaceDescriptor[] = [
        {
          type: 'plane',
          label: 'wall',
          orientation: 'vertical',
          pose: {
            position: [0, 1.5, -2],
            orientation: [0, 0, 0, 1],
          },
          extents: { width: 3, height: 2.5 },
        },
      ];

      const result = processSurfaces(descriptors, 0, defaultStartPose);
      expect(result).toHaveLength(0);
    });

    it('filters out surfaces that are too high', () => {
      const descriptors: SurfaceDescriptor[] = [
        {
          type: 'plane',
          label: 'shelf',
          orientation: 'horizontal',
          pose: {
            position: [0, 2.0, -1],
            orientation: [0, 0, 0, 1],
          },
          extents: { width: 1, height: 0.5 },
        },
      ];

      const result = processSurfaces(descriptors, 0, defaultStartPose);
      expect(result).toHaveLength(0);
    });

    it('filters out surfaces that are too small', () => {
      const descriptors: SurfaceDescriptor[] = [
        {
          type: 'plane',
          label: 'other',
          orientation: 'horizontal',
          pose: {
            position: [0, 0.5, -1],
            orientation: [0, 0, 0, 1],
          },
          extents: { width: 0.15, height: 0.15 },
        },
      ];

      const result = processSurfaces(descriptors, 0, defaultStartPose);
      expect(result).toHaveLength(0);
    });

    it('correctly labels floor surfaces', () => {
      const descriptors: SurfaceDescriptor[] = [
        {
          type: 'plane',
          label: 'other',
          orientation: 'horizontal',
          pose: {
            position: [0, 0.02, 0],
            orientation: [0, 0, 0, 1],
          },
          extents: { width: 5, height: 4 },
        },
      ];

      const result = processSurfaces(descriptors, 0, defaultStartPose);
      expect(result).toHaveLength(1);
      if (result[0]) {
        expect(result[0].label).toBe('floor');
      }
    });

    it('relabels seat-like surfaces based on geometry', () => {
      const descriptors: SurfaceDescriptor[] = [
        {
          type: 'mesh',
          label: 'other',
          isBounded: true,
          pose: {
            position: [0, 0.45, -1],
            orientation: [0, 0, 0, 1],
          },
          bounds: {
            min: [-0.25, 0.3, -1.2],
            max: [0.25, 0.6, -0.8],
          },
        },
      ];

      const result = processSurfaces(descriptors, 0, defaultStartPose);
      expect(result).toHaveLength(1);
      if (result[0]) {
        expect(result[0].label).toBe('seat_like');
      }
    });

    it('merges overlapping plane and mesh', () => {
      const descriptors: SurfaceDescriptor[] = [
        {
          type: 'plane',
          label: 'table',
          orientation: 'horizontal',
          pose: {
            position: [0, 0.75, -1],
            orientation: [0, 0, 0, 1],
          },
          extents: { width: 1, height: 0.6 },
        },
        {
          type: 'mesh',
          label: 'other',
          isBounded: true,
          pose: {
            position: [0.05, 0.73, -1.02],
            orientation: [0, 0, 0, 1],
          },
          bounds: {
            min: [-0.5, 0.65, -1.3],
            max: [0.5, 0.8, -0.7],
          },
        },
      ];

      const result = processSurfaces(descriptors, 0, defaultStartPose);
      expect(result.length).toBeLessThanOrEqual(1);
    });
  });

  describe('computeRoomHash', () => {
    it('generates 12-character hex hash', async () => {
      const surfaces = [
        {
          descriptor: {
            type: 'plane' as const,
            label: 'table',
            orientation: 'horizontal' as const,
            pose: { position: [0, 0.75, -1] as [number, number, number], orientation: [0, 0, 0, 1] as [number, number, number, number] },
          },
          topHeight: 0.75,
          centroid: [0, 0.75, -1] as [number, number, number],
          size: [1, 0.6] as [number, number],
          yaw: 0,
          area: 0.6,
          label: 'table' as const,
        },
      ];

      const hash = await computeRoomHash(surfaces);
      expect(hash).toMatch(/^[0-9a-f]{12}$/);
    });

    it('produces stable hash for same surfaces', async () => {
      const surfaces = [
        {
          descriptor: {
            type: 'plane' as const,
            label: 'table',
            orientation: 'horizontal' as const,
            pose: { position: [0, 0.75, -1] as [number, number, number], orientation: [0, 0, 0, 1] as [number, number, number, number] },
          },
          topHeight: 0.75,
          centroid: [0, 0.75, -1] as [number, number, number],
          size: [1, 0.6] as [number, number],
          yaw: 0,
          area: 0.6,
          label: 'table' as const,
        },
      ];

      const hash1 = await computeRoomHash(surfaces);
      const hash2 = await computeRoomHash(surfaces);
      expect(hash1).toBe(hash2);
    });

    it('produces stable hash under small position jitter', async () => {
      const surfaces1 = [
        {
          descriptor: {
            type: 'plane' as const,
            label: 'table',
            orientation: 'horizontal' as const,
            pose: { position: [0, 0.75, -1] as [number, number, number], orientation: [0, 0, 0, 1] as [number, number, number, number] },
          },
          topHeight: 0.75,
          centroid: [0, 0.75, -1] as [number, number, number],
          size: [1, 0.6] as [number, number],
          yaw: 0,
          area: 0.6,
          label: 'table' as const,
        },
      ];

      const surfaces2 = [
        {
          descriptor: {
            type: 'plane' as const,
            label: 'table',
            orientation: 'horizontal' as const,
            pose: { position: [0.01, 0.76, -1.01] as [number, number, number], orientation: [0, 0, 0, 1] as [number, number, number, number] },
          },
          topHeight: 0.75,
          centroid: [0.01, 0.76, -1.01] as [number, number, number],
          size: [1, 0.6] as [number, number],
          yaw: 0,
          area: 0.6,
          label: 'table' as const,
        },
      ];

      const hash1 = await computeRoomHash(surfaces1);
      const hash2 = await computeRoomHash(surfaces2);
      expect(hash1).toBe(hash2);
    });
  });

  describe('buildSurfaceGraph', () => {
    it('throws error for insufficient surfaces', async () => {
      const descriptors: SurfaceDescriptor[] = [
        {
          type: 'plane',
          label: 'table',
          orientation: 'horizontal',
          pose: {
            position: [0, 0.75, -1],
            orientation: [0, 0, 0, 1],
          },
          extents: { width: 1, height: 0.6 },
        },
      ];

      await expect(
        buildSurfaceGraph(descriptors, 0, defaultStartPose),
      ).rejects.toThrow('Insufficient surfaces');
    });

    it('builds valid graph with minimal surfaces', async () => {
      const descriptors: SurfaceDescriptor[] = [
        {
          type: 'plane',
          label: 'table',
          orientation: 'horizontal',
          pose: {
            position: [0, 0.75, -1],
            orientation: [0, 0, 0, 1],
          },
          extents: { width: 1, height: 0.6 },
        },
        {
          type: 'plane',
          label: 'couch',
          orientation: 'horizontal',
          pose: {
            position: [0, 0.45, -2.5],
            orientation: [0, 0, 0, 1],
          },
          extents: { width: 2, height: 0.9 },
        },
      ];

      const graph = await buildSurfaceGraph(descriptors, 0, defaultStartPose);

      expect(graph.version).toBe(1);
      expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
      expect(graph.nodes.length).toBeLessThanOrEqual(12);
      expect(graph.roomHash).toMatch(/^[0-9a-f]{12}$/);
      expect(graph.mode).toBe('scene');
    });

    it('caps at 12 nodes', async () => {
      const descriptors: SurfaceDescriptor[] = Array.from({ length: 20 }, (_, i) => ({
        type: 'plane' as const,
        label: i === 0 ? 'floor' : 'table',
        orientation: 'horizontal' as const,
        pose: {
          position: [i * 0.5, i === 0 ? 0 : 0.75, -1] as [number, number, number],
          orientation: [0, 0, 0, 1] as [number, number, number, number],
        },
        extents: { width: 1, height: 0.6 },
      }));

      const graph = await buildSurfaceGraph(descriptors, 0, defaultStartPose);
      expect(graph.nodes.length).toBeLessThanOrEqual(12);
    });

    it('produces graph under 2KB serialized', async () => {
      const descriptors: SurfaceDescriptor[] = Array.from({ length: 5 }, (_, i) => ({
        type: 'plane' as const,
        label: i === 0 ? 'floor' : 'table',
        orientation: 'horizontal' as const,
        pose: {
          position: [i * 1.5, i === 0 ? 0 : 0.75, -1] as [number, number, number],
          orientation: [0, 0, 0, 1] as [number, number, number, number],
        },
        extents: { width: 0.8, height: 0.5 },
      }));

      const graph = await buildSurfaceGraph(descriptors, 0, defaultStartPose);
      const serialized = JSON.stringify(graph);
      expect(serialized.length).toBeLessThan(2048);
    });

    it('generates edges between surfaces', async () => {
      const descriptors: SurfaceDescriptor[] = [
        {
          type: 'plane',
          label: 'table',
          orientation: 'horizontal',
          pose: {
            position: [0, 0.75, -1],
            orientation: [0, 0, 0, 1],
          },
          extents: { width: 1, height: 0.6 },
        },
        {
          type: 'plane',
          label: 'couch',
          orientation: 'horizontal',
          pose: {
            position: [0, 0.45, -2.5],
            orientation: [0, 0, 0, 1],
          },
          extents: { width: 2, height: 0.9 },
        },
      ];

      const graph = await buildSurfaceGraph(descriptors, 0, defaultStartPose);
      expect(graph.edges.length).toBeGreaterThan(0);
      expect(graph.edges[0]).toHaveProperty('a');
      expect(graph.edges[0]).toHaveProperty('b');
      expect(graph.edges[0]).toHaveProperty('gap');
      expect(graph.edges[0]).toHaveProperty('dh');
      expect(graph.edges[0]).toHaveProperty('kind');
    });

    it('validates against schema', async () => {
      const { SurfaceGraph } = await import('@roomquest/schema');
      
      const descriptors: SurfaceDescriptor[] = [
        {
          type: 'plane',
          label: 'table',
          orientation: 'horizontal',
          pose: {
            position: [0, 0.75, -1],
            orientation: [0, 0, 0, 1],
          },
          extents: { width: 1, height: 0.6 },
        },
        {
          type: 'plane',
          label: 'couch',
          orientation: 'horizontal',
          pose: {
            position: [0, 0.45, -2.5],
            orientation: [0, 0, 0, 1],
          },
          extents: { width: 2, height: 0.9 },
        },
      ];

      const graph = await buildSurfaceGraph(descriptors, 0, defaultStartPose);
      const result = SurfaceGraph.safeParse(graph);
      expect(result.success).toBe(true);
    });
  });

  describe('performance', () => {
    it('builds graph in under 50ms (median; CI bound 5x)', async () => {
      const descriptors: SurfaceDescriptor[] = Array.from({ length: 12 }, (_, i) => ({
        type: 'plane' as const,
        label: i === 0 ? 'floor' : 'table',
        orientation: 'horizontal' as const,
        pose: {
          position: [i * 0.5, i === 0 ? 0 : 0.75, -1] as [number, number, number],
          orientation: [0, 0, 0, 1] as [number, number, number, number],
        },
        extents: { width: 1, height: 0.6 },
      }));

      await buildSurfaceGraph(descriptors, 0, defaultStartPose);
      const samples: number[] = [];
      for (let i = 0; i < GRAPH_BUILD_SAMPLES; i += 1) {
        const start = performance.now();
        await buildSurfaceGraph(descriptors, 0, defaultStartPose);
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)] ?? 0;
      console.log(
        `buildSurfaceGraph median ${median.toFixed(3)} ms (budget ${String(GRAPH_BUILD_BUDGET_MS)} ms, CI bound ${String(GRAPH_BUILD_CI_BOUND_MS)} ms)`
      );
      expect(median).toBeLessThan(GRAPH_BUILD_CI_BOUND_MS);
    });
  });
});
