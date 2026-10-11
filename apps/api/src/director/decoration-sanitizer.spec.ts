import { DECORATION_LINE_MAX_CHARS } from '@roomquest/schema';
import { describe, expect, it } from 'vitest';
import {
  parseDecoration,
  sanitizeDecorationCandidate,
  stripControlChars,
} from './decoration-sanitizer';

const enums = {
  routeIds: ['r1', 'r2'],
  beats: ['b1', 'b2'],
  hazardTypes: ['slime', 'gate'],
};

const base = {
  routeId: 'r1',
  theme: 'forest',
  twistBeat: 'b2',
  hazards: [{ beat: 'b1', type: 'slime' }],
};

describe('decoration sanitizer', () => {
  it('strips control characters and collapses whitespace', () => {
    expect(stripControlChars('  Hi\u0000 there\n\tfriend\u202E!  ')).toBe(
      'Hi there friend !'
    );
  });

  it('drops empty and overlong lines instead of failing', () => {
    const result = parseDecoration(
      {
        ...base,
        theme: 'for\u0007est',
        lines: [
          { beat: 'b1', text: 'Watch the gap!' },
          { beat: 'b1', text: '\u0000\u0001  ' },
          { beat: 'b2', text: 'x'.repeat(DECORATION_LINE_MAX_CHARS + 1) },
          { beat: 'b2', text: 'Ok\u0008 go' },
          'not an object',
          { beat: 'b1', text: 42 },
        ],
      },
      enums
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decoration.theme).toBe('for est');
    expect(result.decoration.lines).toEqual([
      { beat: 'b1', text: 'Watch the gap!' },
      { beat: 'b2', text: 'Ok go' },
    ]);
    expect(result.report.droppedLines).toBe(4);
    expect(result.report.strippedChars).toBe(true);
  });

  it('keeps at most 8 lines and drops lines for unknown beats', () => {
    const lines = Array.from({ length: 11 }, (_, index) => ({
      beat: index === 0 ? 'b9' : 'b1',
      text: `line ${String(index)}`,
    }));
    const result = parseDecoration({ ...base, lines }, enums);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decoration.lines).toHaveLength(8);
      expect(result.decoration.lines?.[0]?.text).toBe('line 1');
    }
  });

  it('accepts a decoration without lines', () => {
    const result = parseDecoration(base, enums);
    expect(result.ok).toBe(true);
  });

  it('still rejects ids outside the per-request enums', () => {
    expect(parseDecoration({ ...base, routeId: 'r9' }, enums).ok).toBe(false);
    expect(
      parseDecoration(
        { ...base, hazards: [{ beat: 'b1', type: 'lava' }] },
        enums
      ).ok
    ).toBe(false);
  });

  it('does not mutate its input', () => {
    const input = { ...base, lines: [{ beat: 'b1', text: ' hi\u0000 ' }] };
    const snapshot = structuredClone(input);
    sanitizeDecorationCandidate(input);
    expect(input).toEqual(snapshot);
  });
});
