import {
  buildLevelDecorationSchema,
  DECORATION_LINE_MAX_CHARS,
  DECORATION_MAX_LINES,
  type LevelDecorationEnums,
  type LevelDecorationLLM,
} from '@roomquest/schema';

// C0/C1 control characters plus Unicode line/paragraph separators and
// bidi/zero-width format controls that could break HUD rendering.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/gu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strip control characters, collapse whitespace, trim. */
export function stripControlChars(text: string): string {
  return text.replace(CONTROL_CHARS, ' ').replace(/\s+/gu, ' ').trim();
}

export interface DecorationSanitizeReport {
  droppedLines: number;
  strippedChars: boolean;
}

/**
 * Server-side cleanup of a raw decoration candidate before zod parse.
 *
 * - Strips control characters from `theme` and every line `text`.
 * - Drops lines that are empty after stripping, longer than
 *   {@link DECORATION_LINE_MAX_CHARS}, not an object, or not a string —
 *   instead of failing the whole decoration.
 * - When `opts.beats` is given, drops lines whose `beat` is not offered.
 * - Keeps at most {@link DECORATION_MAX_LINES} lines (after the drops).
 *
 * Returns a new object; the input is not mutated. Non-record input is
 * returned unchanged (the schema parse rejects it).
 */
export function sanitizeDecorationCandidate(
  raw: unknown,
  opts?: { beats?: readonly string[] }
): {
  candidate: unknown;
  report: DecorationSanitizeReport;
} {
  const report: DecorationSanitizeReport = {
    droppedLines: 0,
    strippedChars: false,
  };
  if (!isRecord(raw)) {
    return { candidate: raw, report };
  }
  const out: Record<string, unknown> = { ...raw };
  if (typeof raw.theme === 'string') {
    const theme = stripControlChars(raw.theme);
    report.strippedChars ||= theme !== raw.theme;
    out.theme = theme;
  }
  if (raw.lines === undefined || raw.lines === null) {
    delete out.lines;
    return { candidate: out, report };
  }
  if (!Array.isArray(raw.lines)) {
    delete out.lines;
    report.droppedLines += 1;
    return { candidate: out, report };
  }
  const beats = opts?.beats === undefined ? undefined : new Set(opts.beats);
  const lines: { beat: unknown; text: string }[] = [];
  for (const line of raw.lines as unknown[]) {
    if (!isRecord(line) || typeof line.text !== 'string') {
      report.droppedLines += 1;
      continue;
    }
    const text = stripControlChars(line.text);
    report.strippedChars ||= text !== line.text;
    if (text.length === 0 || text.length > DECORATION_LINE_MAX_CHARS) {
      report.droppedLines += 1;
      continue;
    }
    if (
      beats !== undefined &&
      (typeof line.beat !== 'string' || !beats.has(line.beat))
    ) {
      report.droppedLines += 1;
      continue;
    }
    lines.push({ beat: line.beat, text });
  }
  if (lines.length > DECORATION_MAX_LINES) {
    report.droppedLines += lines.length - DECORATION_MAX_LINES;
  }
  out.lines = lines.slice(0, DECORATION_MAX_LINES);
  return { candidate: out, report };
}

export type DecorationParseResult =
  | {
      ok: true;
      decoration: LevelDecorationLLM;
      report: DecorationSanitizeReport;
    }
  | { ok: false; error: string; report: DecorationSanitizeReport };

/**
 * Sanitize, drop lines whose `beat` is not offered this request, then parse
 * with the per-request {@link buildLevelDecorationSchema}. Not wired into the
 * director yet.
 */
export function parseDecoration(
  raw: unknown,
  enums: LevelDecorationEnums
): DecorationParseResult {
  const { candidate, report } = sanitizeDecorationCandidate(raw, {
    beats: enums.beats,
  });
  const parsed = buildLevelDecorationSchema(enums).safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((issue) => issue.message).join('; '),
      report,
    };
  }
  return { ok: true, decoration: parsed.data, report };
}
