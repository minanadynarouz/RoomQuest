import { z } from 'zod';
import { toGeminiSchema } from './json-schema.js';
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
export const PlanSource = z.enum([
  'cache',
  'llm',
  'llm_repaired',
  'procedural',
]);
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
 * Compact Gemini output schema (B-08).
 *
 * Designed for LangChain `withStructuredOutput` on Google Gemini:
 * - Short field names (output tokens dominate latency)
 * - Ids only — no nested surface objects, no free-text (title/beats/dialogue
 *   /reasons). level-core fills those after parse.
 * - No .default() or .transform()
 * - All fields required
 * - No z.tuple(), regex, or unions
 * - Send `LevelPlanLLMGeminiSchema` on the wire; still parse with this zod schema
 *
 * Keys: `th` theme, `pl` placements; each placement `i` id, `pc` piece, `s`
 * surface, `t` second surface (null when unused), `u`/`v`, `lk` links.
 */
export const PlacementLLM = z.object({
  i: z.string(),
  pc: PieceId,
  s: z.string(),
  t: z.string().nullable(),
  u: z.number().min(0).max(1),
  v: z.number().min(0).max(1),
  lk: z.array(z.string()),
});
export type PlacementLLM = z.infer<typeof PlacementLLM>;

export const LevelPlanLLM = z.object({
  th: Theme,
  pl: z.array(PlacementLLM).min(4).max(14),
});
export type LevelPlanLLM = z.infer<typeof LevelPlanLLM>;

/** Gemini `responseSchema` for `withStructuredOutput` (zod parse stays on `LevelPlanLLM`). */
export const LevelPlanLLMGeminiSchema = toGeminiSchema(LevelPlanLLM);

/**
 * Shared slot-placement fragment (#64). Gemini-safe: plain `slot` string,
 * no regex / pattern. The director builds a per-request string enum from
 * `hintedSlotIds(graph, { seed })`. Does not change {@link LevelPlan}.
 */
export const PlacementSlotId = z.object({
  id: z.string(),
  piece: PieceId,
  slot: z.string(),
  to: z.string().nullable(),
  playerBuilt: z.boolean(),
  links: z.array(z.string()),
});
export type PlacementSlotId = z.infer<typeof PlacementSlotId>;

/** Compact Gemini slot placement (`slot` instead of `s`/`u`/`v`). */
export const PlacementSlotLLM = z.object({
  i: z.string(),
  pc: PieceId,
  slot: z.string(),
  t: z.string().nullable(),
  lk: z.array(z.string()),
});
export type PlacementSlotLLM = z.infer<typeof PlacementSlotLLM>;

export const LevelPlanSlotLLM = z.object({
  th: Theme,
  pl: z.array(PlacementSlotLLM).min(4).max(14),
});
export type LevelPlanSlotLLM = z.infer<typeof LevelPlanSlotLLM>;

function slotIdField(slotIds: readonly string[]): z.ZodType<string> {
  if (slotIds.length === 0) {
    return z.string();
  }
  return z.enum(slotIds as [string, ...string[]]);
}

/**
 * Per-request compact slot schema. `slot` is a Gemini string enum of the
 * hinted ids for this graph+seed — no `pattern`.
 */
export function levelPlanSlotLLMSchema(slotIds: readonly string[]): z.ZodType<{
  th: Theme;
  pl: PlacementSlotLLM[];
}> {
  return z.object({
    th: Theme,
    pl: z
      .array(
        z.object({
          i: z.string(),
          pc: PieceId,
          slot: slotIdField(slotIds),
          t: z.string().nullable(),
          lk: z.array(z.string()),
        })
      )
      .min(4)
      .max(14),
  });
}

export function levelPlanSlotLLMGeminiSchema(
  slotIds: readonly string[]
): Record<string, unknown> {
  return toGeminiSchema(levelPlanSlotLLMSchema(slotIds));
}
