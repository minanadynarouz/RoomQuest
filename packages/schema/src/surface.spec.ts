import { describe, it, expect } from 'vitest';
import {
  SurfaceLabel,
  Vec3,
  SurfaceNode,
  SurfaceEdge,
  SurfaceGraph,
} from './surface.js';

describe('Surface schemas', () => {
  describe('SurfaceLabel', () => {
    it('accepts valid labels', () => {
      expect(SurfaceLabel.parse('table')).toBe('table');
      expect(SurfaceLabel.parse('desk')).toBe('desk');
      expect(SurfaceLabel.parse('couch')).toBe('couch');
      expect(SurfaceLabel.parse('floor')).toBe('floor');
      expect(SurfaceLabel.parse('other')).toBe('other');
    });

    it('rejects invalid labels', () => {
      expect(() => SurfaceLabel.parse('chair')).toThrow();
      expect(() => SurfaceLabel.parse('ceiling')).toThrow();
    });
  });

  describe('Vec3', () => {
    it('accepts valid 3D vectors', () => {
      const result = Vec3.parse([1.5, 0.75, -0.3]);
      expect(result).toEqual([1.5, 0.75, -0.3]);
    });

    it('rejects invalid vectors', () => {
      expect(() => Vec3.parse([1, 2])).toThrow(); // too few
      expect(() => Vec3.parse([1, 2, 3, 4])).toThrow(); // too many
      expect(() => Vec3.parse(['x', 'y', 'z'])).toThrow(); // wrong type
    });
  });

  describe('SurfaceNode', () => {
    const validNode = {
      id: 's1',
      label: 'table' as const,
      kind: 'plane' as const,
      topHeight: 0.75,
      centroid: [1.0, 0.75, -0.5] as [number, number, number],
      size: [1.2, 0.8] as [number, number],
      yaw: 0.5,
      area: 0.96,
      reach: 'hand' as const,
      angleFromForward: 15,
    };

    it('accepts valid surface node', () => {
      const result = SurfaceNode.parse(validNode);
      expect(result).toEqual(validNode);
    });

    it('validates id pattern', () => {
      expect(() =>
        SurfaceNode.parse({ ...validNode, id: 's1' }),
      ).not.toThrow();
      expect(() =>
        SurfaceNode.parse({ ...validNode, id: 's12' }),
      ).not.toThrow();
      expect(() =>
        SurfaceNode.parse({ ...validNode, id: 's0' }),
      ).toThrow(); // starts at s1
      expect(() =>
        SurfaceNode.parse({ ...validNode, id: 's13' }),
      ).toThrow(); // max s12
      expect(() =>
        SurfaceNode.parse({ ...validNode, id: 'surface1' }),
      ).toThrow(); // wrong format
    });

    it('validates height range', () => {
      expect(() =>
        SurfaceNode.parse({ ...validNode, topHeight: 0 }),
      ).not.toThrow();
      expect(() =>
        SurfaceNode.parse({ ...validNode, topHeight: 1.8 }),
      ).not.toThrow();
      expect(() =>
        SurfaceNode.parse({ ...validNode, topHeight: -0.1 }),
      ).toThrow();
      expect(() =>
        SurfaceNode.parse({ ...validNode, topHeight: 1.9 }),
      ).toThrow();
    });

    it('validates minimum area', () => {
      expect(() =>
        SurfaceNode.parse({ ...validNode, area: 0.04 }),
      ).not.toThrow();
      expect(() =>
        SurfaceNode.parse({ ...validNode, area: 0.03 }),
      ).toThrow();
    });

    it('validates angleFromForward range', () => {
      expect(() =>
        SurfaceNode.parse({ ...validNode, angleFromForward: 0 }),
      ).not.toThrow();
      expect(() =>
        SurfaceNode.parse({ ...validNode, angleFromForward: 180 }),
      ).not.toThrow();
      expect(() =>
        SurfaceNode.parse({ ...validNode, angleFromForward: 181 }),
      ).toThrow();
    });
  });

  describe('SurfaceEdge', () => {
    const validEdge = {
      a: 's1',
      b: 's2',
      gap: 0.3,
      dh: 0.1,
      kind: 'plank' as const,
    };

    it('accepts valid edge', () => {
      const result = SurfaceEdge.parse(validEdge);
      expect(result).toEqual(validEdge);
    });

    it('validates edge kinds', () => {
      expect(() =>
        SurfaceEdge.parse({ ...validEdge, kind: 'adjacent' }),
      ).not.toThrow();
      expect(() =>
        SurfaceEdge.parse({ ...validEdge, kind: 'ramp' }),
      ).not.toThrow();
      expect(() =>
        SurfaceEdge.parse({ ...validEdge, kind: 'rope' }),
      ).not.toThrow();
      expect(() =>
        SurfaceEdge.parse({ ...validEdge, kind: 'portalOnly' }),
      ).not.toThrow();
      expect(() =>
        SurfaceEdge.parse({ ...validEdge, kind: 'invalid' }),
      ).toThrow();
    });

    it('validates gap is non-negative', () => {
      expect(() => SurfaceEdge.parse({ ...validEdge, gap: 0 })).not.toThrow();
      expect(() =>
        SurfaceEdge.parse({ ...validEdge, gap: -0.1 }),
      ).toThrow();
    });
  });

  describe('SurfaceGraph', () => {
    const validGraph = {
      version: 1 as const,
      roomHash: 'a1b2c3d4e5f6',
      mode: 'scene' as const,
      floorY: 0,
      nodes: [
        {
          id: 's1',
          label: 'table' as const,
          kind: 'plane' as const,
          topHeight: 0.75,
          centroid: [1.0, 0.75, -0.5] as [number, number, number],
          size: [1.2, 0.8] as [number, number],
          yaw: 0,
          area: 0.96,
          reach: 'hand' as const,
          angleFromForward: 15,
        },
        {
          id: 's2',
          label: 'couch' as const,
          kind: 'mesh' as const,
          topHeight: 0.45,
          centroid: [2.5, 0.45, -1.0] as [number, number, number],
          size: [2.0, 0.9] as [number, number],
          yaw: 1.57,
          area: 1.8,
          reach: 'ray' as const,
          angleFromForward: 45,
        },
      ],
      edges: [
        {
          a: 's1',
          b: 's2',
          gap: 0.5,
          dh: -0.3,
          kind: 'plank' as const,
        },
      ],
    };

    it('accepts valid surface graph', () => {
      const result = SurfaceGraph.parse(validGraph);
      expect(result.version).toBe(1);
      expect(result.nodes).toHaveLength(2);
    });

    it('validates version is exactly 1', () => {
      expect(() =>
        SurfaceGraph.parse({ ...validGraph, version: 2 }),
      ).toThrow();
    });

    it('validates roomHash length', () => {
      expect(() =>
        SurfaceGraph.parse({ ...validGraph, roomHash: 'abcdef123456' }),
      ).not.toThrow();
      expect(() =>
        SurfaceGraph.parse({ ...validGraph, roomHash: 'short' }),
      ).toThrow();
      expect(() =>
        SurfaceGraph.parse({ ...validGraph, roomHash: 'toolongstring' }),
      ).toThrow();
    });

    it('validates node count (2..12)', () => {
      const singleNode = {
        ...validGraph,
        nodes: [validGraph.nodes[0]],
      };
      expect(() => SurfaceGraph.parse(singleNode)).toThrow();

      const twoNodes = { ...validGraph };
      expect(() => SurfaceGraph.parse(twoNodes)).not.toThrow();

      const twelveNodes = {
        ...validGraph,
        nodes: Array(12)
          .fill(null)
          .map((_, i) => ({
            ...validGraph.nodes[0],
            id: `s${String(i + 1)}`,
          })),
      };
      expect(() => SurfaceGraph.parse(twelveNodes)).not.toThrow();

      const thirteenNodes = {
        ...validGraph,
        nodes: Array(13)
          .fill(null)
          .map((_, i) => ({
            ...validGraph.nodes[0],
            id: `s${String(i + 1)}`,
          })),
      };
      expect(() => SurfaceGraph.parse(thirteenNodes)).toThrow();
    });

    it('validates edge count (max 66)', () => {
      const maxEdges = {
        ...validGraph,
        nodes: Array(12)
          .fill(null)
          .map((_unused, i) => ({
            ...validGraph.nodes[0],
            id: `s${String(i + 1)}`,
          })),
        edges: Array(66)
          .fill(null)
          .map(() => ({
            a: 's1',
            b: 's2',
            gap: 0.5,
            dh: 0,
            kind: 'adjacent' as const,
          })),
      };
      expect(() => SurfaceGraph.parse(maxEdges)).not.toThrow();

      const tooManyEdges = {
        ...maxEdges,
        edges: [...maxEdges.edges, maxEdges.edges[0]],
      };
      expect(() => SurfaceGraph.parse(tooManyEdges)).toThrow();
    });

    it('validates mode enum', () => {
      expect(() =>
        SurfaceGraph.parse({ ...validGraph, mode: 'scene' }),
      ).not.toThrow();
      expect(() =>
        SurfaceGraph.parse({ ...validGraph, mode: 'tabletop' }),
      ).not.toThrow();
      expect(() =>
        SurfaceGraph.parse({ ...validGraph, mode: 'invalid' }),
      ).toThrow();
    });
  });
});
