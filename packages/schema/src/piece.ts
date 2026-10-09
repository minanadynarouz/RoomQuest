import { z } from 'zod';

/**
 * MVP piece IDs (10 pieces)
 * PRD §4.2, Design Doc §4
 * Post-MVP pieces will be added later without breaking v1 plans
 */
export const PIECE_IDS = [
  'village_hut',
  'crystal_shrine',
  'plank_bridge',
  'ramp',
  'moving_platform',
  'gate',
  'lever',
  'gem',
  'slime',
  'portal',
] as const;

export const PieceId = z.enum(PIECE_IDS);
export type PieceId = z.infer<typeof PieceId>;
