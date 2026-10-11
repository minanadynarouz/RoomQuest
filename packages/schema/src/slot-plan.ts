import { z } from 'zod';
import { toGeminiSchema } from './json-schema.js';
import { Theme } from './level.js';
import { PieceId } from './piece.js';

/**
 * `DIRECTOR_PLACEMENT=slot` output schema (B-08 follow-up).
 *
 * Same compact keys as {@link LevelPlanLLM} but each placement names one
 * hinted slot id (`slot`) instead of `s` + `u` + `v`. The slot id set is
 * per request (`hintedSlotIds(graph, { seed })` in level-core), so this is a
 * factory, not a constant. Gemini-safe: `slot` is a plain string enum (no
 * `pattern`), `t` is `{ type, nullable: true }` after {@link toGeminiSchema}.
 *
 * The server resolves slot ids back to surface+u+v (`resolveSlotIds`)
 * before validation, so clients still receive the unchanged LevelPlan.
 */
export function buildLevelPlanLLMSlotSchema(slotIds: readonly string[]) {
  const unique = [...new Set(slotIds)];
  const [first, ...rest] = unique;
  if (first === undefined) {
    throw new Error('buildLevelPlanLLMSlotSchema needs at least one slot id');
  }
  const PlacementLLMSlot = z.object({
    i: z.string(),
    pc: PieceId,
    slot: z.enum([first, ...rest]),
    t: z.string().nullable(),
    lk: z.array(z.string()),
  });
  return z.object({
    th: Theme,
    pl: z.array(PlacementLLMSlot).min(4).max(14),
  });
}

export type LevelPlanLLMSlotSchema = ReturnType<
  typeof buildLevelPlanLLMSlotSchema
>;
export type LevelPlanLLMSlot = z.infer<LevelPlanLLMSlotSchema>;
export type PlacementLLMSlot = LevelPlanLLMSlot['pl'][number];

/** Gemini `responseSchema` for a per-request slot enum. */
export function buildLevelPlanLLMSlotGeminiSchema(
  slotIds: readonly string[]
): Record<string, unknown> {
  return toGeminiSchema(buildLevelPlanLLMSlotSchema(slotIds));
}
