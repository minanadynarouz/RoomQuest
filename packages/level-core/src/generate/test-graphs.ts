import type {
  SurfaceEdge,
  SurfaceGraph,
  SurfaceLabel,
  SurfaceNode,
  SurfaceReach,
} from '@roomquest/schema';

/**
 * Extra synthetic rooms for B-04 generator coverage.
 *
 * Lives next to the generate tests (not in `@roomquest/fixtures`) so the
 * fixture package stays the single living-room graph until X-02 rooms land.
 */

interface NodeSpec {
  id: string;
  label: SurfaceLabel;
  topHeight: number;
  centroid: [number, number, number];
  size: [number, number];
  area: number;
  reach?: SurfaceReach;
  angleFromForward?: number;
  kind?: SurfaceNode['kind'];
}

function node(spec: NodeSpec): SurfaceNode {
  return {
    id: spec.id,
    label: spec.label,
    kind: spec.kind ?? 'plane',
    topHeight: spec.topHeight,
    centroid: spec.centroid,
    size: spec.size,
    yaw: 0,
    area: spec.area,
    reach: spec.reach ?? 'ray',
    angleFromForward: spec.angleFromForward ?? 0,
  };
}

function edge(
  a: string,
  b: string,
  gap: number,
  dh: number,
  kind: SurfaceEdge['kind']
): SurfaceEdge {
  return { a, b, gap, dh, kind };
}

/**
 * Two tables, one plankable gap. Stresses the 2-node fallback path.
 */
export const TINY_TWO_TABLES: SurfaceGraph = {
  version: 1,
  roomHash: 'a1b2c3d4e5f6',
  mode: 'scene',
  floorY: 0,
  nodes: [
    node({
      id: 's1',
      label: 'table',
      topHeight: 0.75,
      centroid: [0, 0.75, 0],
      size: [1.0, 0.8],
      area: 0.8,
      reach: 'hand',
      angleFromForward: 0,
    }),
    node({
      id: 's2',
      label: 'table',
      topHeight: 0.7,
      centroid: [0, 0.7, -1.6],
      size: [1.0, 0.8],
      area: 0.8,
      reach: 'ray',
      angleFromForward: 18,
    }),
  ],
  edges: [edge('s1', 's2', 0.5, -0.05, 'plank')],
};

/**
 * Small office: two desks, a couch, a shelf, floor.
 */
export const SYNTHETIC_OFFICE: SurfaceGraph = {
  version: 1,
  roomHash: 'b2c3d4e5f607',
  mode: 'scene',
  floorY: 0,
  nodes: [
    node({
      id: 's1',
      label: 'desk',
      topHeight: 0.74,
      centroid: [0, 0.74, -0.6],
      size: [1.4, 0.7],
      area: 0.98,
      reach: 'hand',
      angleFromForward: 5,
    }),
    node({
      id: 's2',
      label: 'desk',
      topHeight: 0.72,
      centroid: [1.7, 0.72, -0.6],
      size: [1.2, 0.6],
      area: 0.72,
      reach: 'ray',
      angleFromForward: 28,
    }),
    node({
      id: 's3',
      label: 'couch',
      topHeight: 0.45,
      centroid: [0.2, 0.45, -2.4],
      size: [2.0, 0.9],
      area: 1.8,
      reach: 'ray',
      angleFromForward: 32,
    }),
    node({
      id: 's4',
      label: 'shelf',
      topHeight: 1.05,
      centroid: [1.6, 1.05, -2.2],
      size: [0.8, 0.3],
      area: 0.24,
      reach: 'ray',
      angleFromForward: 40,
    }),
    node({
      id: 's5',
      label: 'floor',
      topHeight: 0,
      centroid: [0.4, 0, -1.4],
      size: [4.0, 3.2],
      area: 12.8,
      reach: 'hand',
      angleFromForward: 0,
    }),
  ],
  edges: [
    edge('s1', 's2', 0.4, -0.02, 'plank'),
    edge('s1', 's3', 0.55, -0.29, 'plank'),
    edge('s3', 's4', 0.2, 0.6, 'adjacent'),
    edge('s3', 's5', 0, -0.45, 'adjacent'),
    edge('s2', 's5', 0, -0.72, 'ramp'),
  ],
};

/**
 * Bedroom: dresser (table), bed, nightstand, floor, shelf.
 */
export const SYNTHETIC_BEDROOM: SurfaceGraph = {
  version: 1,
  roomHash: 'c3d4e5f60718',
  mode: 'scene',
  floorY: 0,
  nodes: [
    node({
      id: 's1',
      label: 'table',
      topHeight: 0.75,
      centroid: [1.2, 0.75, -0.8],
      size: [1.2, 0.5],
      area: 0.6,
      reach: 'hand',
      angleFromForward: 8,
    }),
    node({
      id: 's2',
      label: 'bed',
      topHeight: 0.5,
      centroid: [0, 0.5, -2.5],
      size: [2.0, 1.4],
      area: 2.8,
      reach: 'ray',
      angleFromForward: 22,
    }),
    node({
      id: 's3',
      label: 'table',
      topHeight: 0.55,
      centroid: [1.1, 0.55, -2.3],
      size: [0.4, 0.4],
      area: 0.16,
      reach: 'hand',
      angleFromForward: 26,
    }),
    node({
      id: 's4',
      label: 'floor',
      topHeight: 0,
      centroid: [0.4, 0, -1.6],
      size: [4.0, 4.0],
      area: 16,
      reach: 'hand',
      angleFromForward: 0,
    }),
    node({
      id: 's5',
      label: 'shelf',
      topHeight: 1.15,
      centroid: [1.5, 1.15, -1.6],
      size: [0.9, 0.3],
      area: 0.27,
      reach: 'ray',
      angleFromForward: 38,
    }),
  ],
  edges: [
    edge('s1', 's2', 0.5, -0.25, 'plank'),
    edge('s2', 's3', 0.1, 0.05, 'adjacent'),
    edge('s2', 's4', 0, -0.5, 'adjacent'),
    edge('s1', 's4', 0, -0.75, 'ramp'),
    edge('s5', 's1', 0.35, -0.4, 'ramp'),
  ],
};

/**
 * Long hall: six surfaces in a chain of adjacent + plank hops.
 */
export const SYNTHETIC_HALL: SurfaceGraph = {
  version: 1,
  roomHash: 'd4e5f6071829',
  mode: 'scene',
  floorY: 0,
  nodes: [
    node({
      id: 's1',
      label: 'table',
      topHeight: 0.75,
      centroid: [0, 0.75, 0],
      size: [1.2, 0.7],
      area: 0.84,
      reach: 'hand',
      angleFromForward: 0,
    }),
    node({
      id: 's2',
      label: 'table',
      topHeight: 0.74,
      centroid: [0, 0.74, -1.05],
      size: [1.0, 0.6],
      area: 0.6,
      reach: 'hand',
      angleFromForward: 12,
    }),
    node({
      id: 's3',
      label: 'desk',
      topHeight: 0.7,
      centroid: [0, 0.7, -2.2],
      size: [1.1, 0.6],
      area: 0.66,
      reach: 'ray',
      angleFromForward: 20,
    }),
    node({
      id: 's4',
      label: 'couch',
      topHeight: 0.44,
      centroid: [0, 0.44, -3.4],
      size: [1.8, 0.85],
      area: 1.53,
      reach: 'ray',
      angleFromForward: 28,
    }),
    node({
      id: 's5',
      label: 'desk',
      topHeight: 0.72,
      centroid: [1.3, 0.72, -3.4],
      size: [1.0, 0.55],
      area: 0.55,
      reach: 'ray',
      angleFromForward: 36,
    }),
    node({
      id: 's6',
      label: 'table',
      topHeight: 0.68,
      centroid: [1.3, 0.68, -4.7],
      size: [0.9, 0.6],
      area: 0.54,
      reach: 'ray',
      angleFromForward: 44,
    }),
  ],
  edges: [
    edge('s1', 's2', 0.08, -0.01, 'adjacent'),
    edge('s2', 's3', 0.45, -0.04, 'plank'),
    edge('s3', 's4', 0.5, -0.26, 'plank'),
    edge('s4', 's5', 0.12, 0.28, 'adjacent'),
    edge('s5', 's6', 0.55, -0.04, 'plank'),
  ],
};

export const EXTRA_TEST_GRAPHS: readonly {
  name: string;
  graph: SurfaceGraph;
}[] = [
  { name: 'tiny_two_tables', graph: TINY_TWO_TABLES },
  { name: 'synthetic_office', graph: SYNTHETIC_OFFICE },
  { name: 'synthetic_bedroom', graph: SYNTHETIC_BEDROOM },
  { name: 'synthetic_hall', graph: SYNTHETIC_HALL },
];
