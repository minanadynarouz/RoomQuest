import type { PieceId } from './piece.js';
import { PIECE_IDS } from './piece.js';
import type { SurfaceLabel } from './surface.js';

/**
 * Piece constraint definition
 * PRD §4.2, Design Doc §4
 */
export interface PieceConstraints {
  /** Piece identifier */
  id: PieceId;
  /** Role description */
  role: string;
  /** Interaction type */
  interaction: string;
  /** Allowed surface labels (null = any) */
  allowedSurfaces: readonly SurfaceLabel[] | null;
  /** Minimum surface area in m² */
  minArea?: number;
  /** Minimum surface height above floor in m */
  minHeight?: number;
  /** Maximum surface height above floor in m */
  maxHeight?: number;
  /** Minimum gap for bridges/ramps in m */
  minGap?: number;
  /** Maximum gap for bridges/ramps in m */
  maxGap?: number;
  /** Maximum height difference in m */
  maxDeltaHeight?: number;
  /** Maximum angle from forward view in degrees */
  maxAngleFromForward?: number;
  /** Must be within reach distance */
  maxReachDistance?: number;
  /** Requires second surface (for bridges, portals) */
  requiresSecondSurface?: boolean;
  /** Maximum count per level */
  maxPerLevel?: number;
  /** Must be on path */
  mustBeOnPath?: boolean;
}

/**
 * Complete piece kit catalog with numeric constraints from PRD §4.2
 * Structured for easy addition of post-MVP pieces
 */
export const KIT_CATALOG: Readonly<Record<PieceId, PieceConstraints>> = {
  village_hut: {
    id: 'village_hut',
    role: 'Start point',
    interaction: 'none',
    allowedSurfaces: ['table', 'desk'],
    minArea: 0.3,
    minHeight: 0.4,
    maxHeight: 1.1,
    maxAngleFromForward: 50,
    maxPerLevel: 1,
  },
  crystal_shrine: {
    id: 'crystal_shrine',
    role: 'Goal',
    interaction: 'none (win trigger)',
    allowedSurfaces: null, // any horizontal surface
    maxPerLevel: 1,
  },
  plank_bridge: {
    id: 'plank_bridge',
    role: 'Player-built crossing',
    interaction: 'near pinch from tray, snap',
    allowedSurfaces: null,
    minGap: 0.1,
    maxGap: 0.9,
    maxDeltaHeight: 0.25,
    requiresSecondSurface: true,
  },
  ramp: {
    id: 'ramp',
    role: 'Up/down link',
    interaction: 'near pinch from tray, snap',
    allowedSurfaces: null,
    maxDeltaHeight: 0.6,
    requiresSecondSurface: true,
  },
  moving_platform: {
    id: 'moving_platform',
    role: 'Ferry on a rail',
    interaction: 'near pinch or ray + pinch drag',
    allowedSurfaces: ['table', 'desk', 'floor'],
    maxPerLevel: 1,
  },
  gate: {
    id: 'gate',
    role: 'Blocks an edge',
    interaction: 'opened by linked lever',
    allowedSurfaces: null,
    mustBeOnPath: true,
  },
  lever: {
    id: 'lever',
    role: 'Opens linked gate(s)',
    interaction: 'poke (near) or ray + pinch (far)',
    allowedSurfaces: null,
    maxReachDistance: 0.7,
    maxAngleFromForward: 50,
  },
  gem: {
    id: 'gem',
    role: 'Optional score',
    interaction: 'auto-collected by explorer',
    allowedSurfaces: null,
    mustBeOnPath: true,
  },
  slime: {
    id: 'slime',
    role: 'Patrol enemy',
    interaction: 'poke or ray-tap to stun',
    allowedSurfaces: ['couch', 'bed', 'table'],
    minArea: 0.5,
  },
  portal: {
    id: 'portal',
    role: 'Links unconnectable surfaces',
    interaction: 'none (explorer uses it)',
    allowedSurfaces: null,
    requiresSecondSurface: true,
    maxPerLevel: 2, // pair
    maxAngleFromForward: 50,
  },
} as const;

/**
 * Helper to get constraints for a piece
 */
export function getPieceConstraints(pieceId: PieceId): PieceConstraints {
  return KIT_CATALOG[pieceId];
}

/**
 * Type guard to check if a string is a valid piece ID
 */
export function isPieceId(value: string): value is PieceId {
  return (PIECE_IDS as readonly string[]).includes(value);
}
