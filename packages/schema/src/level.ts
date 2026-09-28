import { z } from 'zod';
import { PieceId } from './piece.js';

/**
 * Par time bounds for level completion (milliseconds)
 * Sessions must complete within 10 minutes (600000 ms)
 */
export const PAR_TIME_MIN_MS = 60000; // 1 minute
export const PAR_TIME_MAX_MS = 480000; // 8 minutes

/**
 * Theme palette for level
 */
export const Theme = z.enum(['forest', 'desert', 'snow', 'sky']);
export type Theme = z.infer<typeof Theme>;

/**
 * Difficulty tier
 */
export const Tier = z.enum(['easy', 'normal']);
export type Tier = z.infer<typeof Tier>;

/**
 * Plan source tracking
 */
export const PlanSource = z.enum(['cache', 'llm', 'llm_repaired', 'procedural']);
export type PlanSource = z.infer<typeof PlanSource>;

/**
 * Dialogue trigger types
 */
export const DialogueTrigger = z.enum([
  'intro',
  'beat',
  'stuck',
  'win',
  'gaze',
]);
export type DialogueTrigger = z.infer<typeof DialogueTrigger>;

/**
 * Single piece placement in the level
 * Design Doc §6
 */
export const Placement = z.object({
  /** Unique placement identifier (e.g., "p1") */
  id: z.string(),
  /** Piece type from kit */
  piece: PieceId,
  /** Surface id this piece is placed on */
  surface: z.string(),
  /** Optional second surface for bridges/ramps/portals */
  to: z.string().optional(),
  /** U coordinate on surface (0..1, along width) */
  u: z.number().min(0).max(1),
  /** V coordinate on surface (0..1, along depth) */
  v: z.number().min(0).max(1),
  /** Whether this piece is built by the player */
  playerBuilt: z.boolean().default(false),
  /** Linked piece ids (for lever->gate) */
  links: z.array(z.string()).max(2).default([]),
});
export type Placement = z.infer<typeof Placement>;

/**
 * Beat goal in the level
 */
export const Beat = z.object({
  /** Goal text shown to player (max 80 chars) */
  goal: z.string().max(80),
  /** Placement ids involved in this beat */
  uses: z.array(z.string()),
});
export type Beat = z.infer<typeof Beat>;

/**
 * Dialogue line
 */
export const Dialogue = z.object({
  /** When this line is triggered */
  trigger: DialogueTrigger,
  /** Line text (max 90 chars) */
  line: z.string().max(90),
});
export type Dialogue = z.infer<typeof Dialogue>;

/**
 * Complete level plan
 * Design Doc §6
 * This is the normalized form with defaults applied
 */
export const LevelPlan = z.object({
  /** Daily seed: roomHash + "-" + date */
  seed: z.string(),
  /** Visual theme */
  theme: Theme,
  /** Level title (max 40 chars) */
  title: z.string().max(40),
  /** Start surface id (must have village_hut) */
  start: z.string(),
  /** Goal surface id (must have crystal_shrine) */
  goal: z.string(),
  /** All piece placements (4..14) */
  placements: z.array(Placement).min(4).max(14),
  /** Progression beats (2..4) */
  beats: z.array(Beat).min(2).max(4),
  /** Dialogue lines (max 12) */
  dialogue: z.array(Dialogue).max(12),
  /** Par completion time in milliseconds (1-8 minutes) */
  parTimeMs: z.number().int().min(PAR_TIME_MIN_MS).max(PAR_TIME_MAX_MS),
});
export type LevelPlan = z.infer<typeof LevelPlan>;

/**
 * LLM-safe level plan schema
 * Architecture §5, B-05 ticket notes
 *
 * This schema is designed for LangChain withStructuredOutput on Google Gemini:
 * - No .default() or .transform() (applied after parsing)
 * - All fields required
 * - No z.tuple() (use arrays with min/max)
 * - No regex patterns
 * - No unions or discriminated unions
 * - Flat objects with primitives, enums, strings, numbers, and simple arrays
 *
 * Parse LLM output with LevelPlanLLM, then use LevelPlan.parse() to normalize.
 */
export const PlacementLLM = z.object({
  id: z.string(),
  piece: PieceId,
  surface: z.string(),
  to: z.string().nullable(),
  u: z.number().min(0).max(1),
  v: z.number().min(0).max(1),
  playerBuilt: z.boolean(),
  links: z.array(z.string()),
});
export type PlacementLLM = z.infer<typeof PlacementLLM>;

export const BeatLLM = z.object({
  goal: z.string(),
  uses: z.array(z.string()),
});
export type BeatLLM = z.infer<typeof BeatLLM>;

export const DialogueLLM = z.object({
  trigger: DialogueTrigger,
  line: z.string(),
});
export type DialogueLLM = z.infer<typeof DialogueLLM>;

export const LevelPlanLLM = z.object({
  seed: z.string(),
  theme: Theme,
  title: z.string(),
  start: z.string(),
  goal: z.string(),
  placements: z.array(PlacementLLM).min(4).max(14),
  beats: z.array(BeatLLM).min(2).max(4),
  dialogue: z.array(DialogueLLM).max(12),
  parTimeMs: z
    .number()
    .int()
    .min(PAR_TIME_MIN_MS)
    .max(PAR_TIME_MAX_MS)
    .describe(
      'Par completion time in milliseconds for 3-star rating (1-8 minutes)',
    ),
});
export type LevelPlanLLM = z.infer<typeof LevelPlanLLM>;
