import type { SurfaceGraph } from '@roomquest/schema';

/**
 * Hand-written synthetic living room surface graph
 * Used for testing and as a fixture when real scene understanding is unavailable
 *
 * Layout:
 * - s1: Coffee table (0.75m high, center of room, hand reach)
 * - s2: Couch (0.45m high, behind table, ray reach)
 * - s3: TV stand (0.50m high, in front of table, ray reach)
 * - s4: Side table (0.60m high, next to couch, hand reach)
 * - s5: Floor (0m, surrounding everything)
 *
 * Edges provide various traversal options for testing
 */
export const SYNTHETIC_LIVING_ROOM: SurfaceGraph = {
  version: 1,
  roomHash: 'f1a2b3c4d5e6', // synthetic, stable hash
  mode: 'scene',
  floorY: 0,
  nodes: [
    {
      id: 's1',
      label: 'table',
      kind: 'plane',
      topHeight: 0.75,
      centroid: [0.0, 0.75, -1.0],
      size: [1.0, 0.6],
      yaw: 0.0,
      area: 0.6,
      reach: 'hand',
      angleFromForward: 0,
    },
    {
      id: 's2',
      label: 'couch',
      kind: 'mesh',
      topHeight: 0.45,
      centroid: [0.0, 0.45, -2.5],
      size: [2.0, 0.9],
      yaw: 0.0,
      area: 1.8,
      reach: 'ray',
      angleFromForward: 25,
    },
    {
      id: 's3',
      label: 'desk',
      kind: 'plane',
      topHeight: 0.5,
      centroid: [0.0, 0.5, 0.3],
      size: [1.2, 0.5],
      yaw: 3.14159,
      area: 0.6,
      reach: 'ray',
      angleFromForward: 35,
    },
    {
      id: 's4',
      label: 'table',
      kind: 'plane',
      topHeight: 0.6,
      centroid: [0.9, 0.6, -2.2],
      size: [0.4, 0.4],
      yaw: 0.0,
      area: 0.16,
      reach: 'hand',
      angleFromForward: 40,
    },
    {
      id: 's5',
      label: 'floor',
      kind: 'plane',
      topHeight: 0.0,
      centroid: [0.0, 0.0, -1.0],
      size: [4.0, 3.0],
      yaw: 0.0,
      area: 12.0,
      reach: 'hand',
      angleFromForward: 0,
    },
  ],
  edges: [
    // s1 (coffee table) to s2 (couch) - plank bridge distance
    {
      a: 's1',
      b: 's2',
      gap: 0.6,
      dh: -0.3,
      kind: 'plank',
    },
    // s1 to s3 (TV stand) - plank bridge distance
    {
      a: 's1',
      b: 's3',
      gap: 0.5,
      dh: -0.25,
      kind: 'plank',
    },
    // s2 (couch) to s4 (side table) - adjacent
    {
      a: 's2',
      b: 's4',
      gap: 0.1,
      dh: 0.15,
      kind: 'adjacent',
    },
    // s1 to s5 (floor) - ramp possible
    {
      a: 's1',
      b: 's5',
      gap: 0.0,
      dh: -0.75,
      kind: 'ramp',
    },
    // s3 to s5 - ramp possible
    {
      a: 's3',
      b: 's5',
      gap: 0.0,
      dh: -0.5,
      kind: 'ramp',
    },
    // s2 to s5 - adjacent (couch to floor)
    {
      a: 's2',
      b: 's5',
      gap: 0.0,
      dh: -0.45,
      kind: 'adjacent',
    },
  ],
};
