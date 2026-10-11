import { describe, expect, it } from 'vitest';
import {
  buildLevelDecorationGeminiSchema,
  buildLevelDecorationSchema,
  DECORATION_LINE_MAX_CHARS,
  DECORATION_MAX_LINES,
  LevelDecorationLLM,
} from './decoration.js';
import { validateLLMSafeJsonSchema } from './json-schema.js';
import {
  buildLevelPlanLLMSlotGeminiSchema,
  buildLevelPlanLLMSlotSchema,
} from './slot-plan.js';

const FORBIDDEN = [
  'anyOf',
  'oneOf',
  'allOf',
  'const',
  'pattern',
  'default',
  '$schema',
  'additionalProperties',
  'prefixItems',
  'exclusiveMinimum',
  'exclusiveMaximum',
] as const;

function violations(value: unknown, path = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const record = value as Record<string, unknown>;
  const out: string[] = [];
  if (Array.isArray(record.type)) {
    out.push(`${path}: type array`);
  }
  for (const key of FORBIDDEN) {
    if (key in record) {
      out.push(`${path}: '${key}'`);
    }
  }
  for (const [key, child] of Object.entries(record)) {
    const next = path ? `${path}.${key}` : key;
    if (Array.isArray(child)) {
      child.forEach((item, index) => {
        out.push(...violations(item, `${next}[${String(index)}]`));
      });
    } else {
      out.push(...violations(child, next));
    }
  }
  return out;
}

function prop(schema: unknown, ...keys: string[]): Record<string, unknown> {
  let cur = schema as Record<string, unknown>;
  for (const key of keys) {
    cur = cur[key] as Record<string, unknown>;
  }
  return cur;
}

describe('buildLevelPlanLLMSlotSchema', () => {
  const slots = ['s1', 's2', 's3', 's4', 's5'];

  it('emits a Gemini-safe schema with slot as a per-request string enum', () => {
    const gemini = buildLevelPlanLLMSlotGeminiSchema(slots);
    expect(violations(gemini)).toEqual([]);
    expect(validateLLMSafeJsonSchema(gemini)).toEqual([]);
    const item = prop(gemini, 'properties', 'pl', 'items', 'properties');
    expect(item.slot).toEqual({ type: 'string', enum: slots });
    expect(item.t).toEqual({ type: 'string', nullable: true });
    expect(item.s).toBeUndefined();
    expect(item.u).toBeUndefined();
    expect(JSON.stringify(gemini)).not.toContain('pattern');
  });

  it('rejects slot ids outside the request enum', () => {
    const schema = buildLevelPlanLLMSlotSchema(slots);
    const row = (slot: string, i: string) => ({
      i,
      pc: 'gem',
      slot,
      t: null,
      lk: [],
    });
    const ok = schema.safeParse({
      th: 'forest',
      pl: [row('s1', 'a'), row('s2', 'b'), row('s3', 'c'), row('s4', 'd')],
    });
    expect(ok.success).toBe(true);
    const bad = schema.safeParse({
      th: 'forest',
      pl: [row('s9', 'a'), row('s2', 'b'), row('s3', 'c'), row('s4', 'd')],
    });
    expect(bad.success).toBe(false);
  });

  it('throws when no slot ids are offered', () => {
    expect(() => buildLevelPlanLLMSlotSchema([])).toThrow();
  });
});

describe('buildLevelDecorationSchema', () => {
  const enums = {
    routeIds: ['r1', 'r2'],
    beats: ['b1', 'b2', 'b3'],
    hazardTypes: ['slime', 'gate'],
  };

  it('converts to a Gemini-safe schema with per-request enums', () => {
    const gemini = buildLevelDecorationGeminiSchema(enums);
    expect(violations(gemini)).toEqual([]);
    expect(validateLLMSafeJsonSchema(gemini)).toEqual([]);
    const props = prop(gemini, 'properties');
    expect(props.routeId).toEqual({ type: 'string', enum: ['r1', 'r2'] });
    expect(props.twistBeat).toEqual({ type: 'string', enum: enums.beats });
    expect(props.theme).toEqual({ type: 'string' });
    const hazard = prop(gemini, 'properties', 'hazards', 'items', 'properties');
    expect(hazard.beat).toEqual({ type: 'string', enum: enums.beats });
    expect(hazard.type).toEqual({ type: 'string', enum: enums.hazardTypes });
    const lines = prop(gemini, 'properties', 'lines');
    expect(lines.maxItems).toBe(DECORATION_MAX_LINES);
    const text = prop(lines, 'items', 'properties', 'text');
    expect(text.maxLength).toBe(DECORATION_LINE_MAX_CHARS);
    expect(gemini.required).toEqual(['routeId', 'theme', 'twistBeat', 'hazards']);
  });

  it('parses the agreed shape and enforces enums and limits', () => {
    const schema = buildLevelDecorationSchema(enums);
    const base = {
      routeId: 'r1',
      theme: 'forest',
      twistBeat: 'b2',
      hazards: [{ beat: 'b1', type: 'slime' }],
    };
    expect(schema.safeParse(base).success).toBe(true);
    expect(
      schema.safeParse({ ...base, lines: [{ beat: 'b1', text: 'Hello!' }] })
        .success
    ).toBe(true);
    expect(schema.safeParse({ ...base, routeId: 'r9' }).success).toBe(false);
    expect(
      schema.safeParse({ ...base, hazards: [{ beat: 'b1', type: 'lava' }] })
        .success
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        lines: [{ beat: 'b1', text: 'x'.repeat(DECORATION_LINE_MAX_CHARS + 1) }],
      }).success
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        lines: Array.from({ length: DECORATION_MAX_LINES + 1 }, () => ({
          beat: 'b1',
          text: 'hi',
        })),
      }).success
    ).toBe(false);
    expect(LevelDecorationLLM.safeParse(base).success).toBe(true);
  });

  it('throws on empty enum inputs', () => {
    expect(() =>
      buildLevelDecorationSchema({ ...enums, routeIds: [] })
    ).toThrow();
  });
});
