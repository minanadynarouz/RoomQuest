import { z } from 'zod';
import { toGeminiSchema } from './json-schema.js';

/** Max `lines` entries in {@link LevelDecorationLLM}. */
export const DECORATION_MAX_LINES = 8;
/** Max characters per decoration line `text`. */
export const DECORATION_LINE_MAX_CHARS = 80;

/**
 * Static (non-enum) shape of the decoration call output. At call time
 * `routeId`, `twistBeat`, `beat` and hazard `type` are narrowed to
 * per-request string enums via {@link buildLevelDecorationSchema}.
 * Schema only — not wired into the director yet.
 */
export const LevelDecorationLLM = z.object({
  routeId: z.string(),
  theme: z.string(),
  twistBeat: z.string(),
  hazards: z.array(
    z.object({
      beat: z.string(),
      type: z.string(),
    })
  ),
  lines: z
    .array(
      z.object({
        beat: z.string(),
        text: z.string().max(DECORATION_LINE_MAX_CHARS),
      })
    )
    .max(DECORATION_MAX_LINES)
    .optional(),
});
export type LevelDecorationLLM = z.infer<typeof LevelDecorationLLM>;

export interface LevelDecorationEnums {
  routeIds: readonly string[];
  beats: readonly string[];
  hazardTypes: readonly string[];
}

function stringEnum(values: readonly string[], label: string) {
  const unique = [...new Set(values)];
  const [first, ...rest] = unique;
  if (first === undefined) {
    throw new Error(`buildLevelDecorationSchema needs at least one ${label}`);
  }
  return z.enum([first, ...rest]);
}

/**
 * Per-request decoration schema: ids become string enums (Gemini-safe, no
 * `pattern`). Parse output with this zod schema after running the API's
 * decoration sanitizer; send {@link buildLevelDecorationGeminiSchema} on the
 * wire.
 */
export function buildLevelDecorationSchema(enums: LevelDecorationEnums) {
  const routeId = stringEnum(enums.routeIds, 'routeId');
  const beat = stringEnum(enums.beats, 'beat');
  const hazardType = stringEnum(enums.hazardTypes, 'hazard type');
  return z.object({
    routeId,
    theme: z.string(),
    twistBeat: beat,
    hazards: z.array(z.object({ beat, type: hazardType })),
    lines: z
      .array(
        z.object({
          beat,
          text: z.string().max(DECORATION_LINE_MAX_CHARS),
        })
      )
      .max(DECORATION_MAX_LINES)
      .optional(),
  });
}

export function buildLevelDecorationGeminiSchema(
  enums: LevelDecorationEnums
): Record<string, unknown> {
  return toGeminiSchema(buildLevelDecorationSchema(enums));
}
