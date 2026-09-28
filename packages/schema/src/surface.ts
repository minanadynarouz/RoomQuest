import { z } from 'zod';

/**
 * Surface semantic labels from scene understanding
 * PRD §4, Design Doc §5
 */
export const SurfaceLabel = z.enum([
  'table',
  'desk',
  'couch',
  'bed',
  'shelf',
  'storage',
  'floor',
  'seat_like',
  'other',
]);
export type SurfaceLabel = z.infer<typeof SurfaceLabel>;

/**
 * 3D vector [x, y, z] in meters, local-floor space
 */
export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3>;

/**
 * Surface reach classification from player start pose
 */
export const SurfaceReach = z.enum(['hand', 'ray', 'outOfView']);
export type SurfaceReach = z.infer<typeof SurfaceReach>;

/**
 * Surface node in the graph
 * Design Doc §5
 */
export const SurfaceNode = z.object({
  /** Surface identifier: "s1".."s12" */
  id: z.string().regex(/^s([1-9]|1[0-2])$/),
  /** Semantic label from scene understanding or inferred */
  label: SurfaceLabel,
  /** Source: plane, mesh, or merged plane+mesh */
  kind: z.enum(['plane', 'mesh', 'merged']),
  /** Height of top surface above floor in meters (0..1.8) */
  topHeight: z.number().min(0).max(1.8),
  /** Centroid in local-floor space, cm-rounded */
  centroid: Vec3,
  /** [width, depth] of top face in meters */
  size: z.tuple([z.number(), z.number()]),
  /** Orientation of top face in radians */
  yaw: z.number(),
  /** Top surface area in m² */
  area: z.number().min(0.04),
  /** Reachability from seated start pose */
  reach: SurfaceReach,
  /** Angle from forward view in degrees (0..180) */
  angleFromForward: z.number().min(0).max(180),
});
export type SurfaceNode = z.infer<typeof SurfaceNode>;

/**
 * Edge kind between surfaces
 */
export const EdgeKind = z.enum([
  'adjacent',
  'plank',
  'ramp',
  'rope',
  'portalOnly',
]);
export type EdgeKind = z.infer<typeof EdgeKind>;

/**
 * Edge connecting two surfaces
 */
export const SurfaceEdge = z.object({
  /** Source surface id */
  a: z.string(),
  /** Target surface id */
  b: z.string(),
  /** Horizontal gap in meters */
  gap: z.number().min(0),
  /** Height difference in meters (positive = b higher than a) */
  dh: z.number(),
  /** Edge traversal type */
  kind: EdgeKind,
});
export type SurfaceEdge = z.infer<typeof SurfaceEdge>;

/**
 * Complete surface graph for a scanned room
 * Design Doc §5, Architecture §5
 */
export const SurfaceGraph = z.object({
  /** Schema version */
  version: z.literal(1),
  /** Stable hash of top 6 surfaces (12 hex chars) */
  roomHash: z.string().length(12),
  /** Scene understanding mode */
  mode: z.enum(['scene', 'tabletop']),
  /** Floor Y coordinate in local-floor space */
  floorY: z.number(),
  /** Surface nodes (2..12) */
  nodes: z.array(SurfaceNode).min(2).max(12),
  /** Edges between surfaces (max 66 = 12*11/2) */
  edges: z.array(SurfaceEdge).max(66),
});
export type SurfaceGraph = z.infer<typeof SurfaceGraph>;
