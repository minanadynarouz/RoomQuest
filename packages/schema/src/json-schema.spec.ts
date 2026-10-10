import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  geminiNumericEnum,
  toGeminiSchema,
  toJsonSchema,
  validateLLMSafeJsonSchema,
} from './json-schema.js';
import { LevelPlanLLM, LevelPlanLLMGeminiSchema } from './level.js';

const GEMINI_FORBIDDEN_KEYS = [
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

function collectGeminiViolations(value: unknown, path = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  if (Array.isArray(record.type)) {
    errors.push(`${path}: type array ${JSON.stringify(record.type)}`);
  }
  for (const key of GEMINI_FORBIDDEN_KEYS) {
    if (key in record) {
      errors.push(`${path}: '${key}' found`);
    }
  }
  for (const [key, child] of Object.entries(record)) {
    const next = path ? `${path}.${key}` : key;
    if (Array.isArray(child)) {
      child.forEach((item, index) => {
        errors.push(
          ...collectGeminiViolations(item, `${next}[${String(index)}]`)
        );
      });
    } else {
      errors.push(...collectGeminiViolations(child, next));
    }
  }
  return errors;
}

function placementToSchema(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const properties = schema.properties as Record<string, unknown>;
  const placements = properties.placements as Record<string, unknown>;
  const items = placements.items as Record<string, unknown>;
  const itemProps = items.properties as Record<string, unknown>;
  return itemProps.to as Record<string, unknown>;
}

describe('toGeminiSchema', () => {
  it('rewrites type lists containing null to type + nullable:true', () => {
    const schema = z.object({
      to: z.string().nullable(),
    });
    const gemini = toGeminiSchema(schema);
    const properties = gemini.properties as Record<string, unknown>;
    expect(properties.to).toEqual({ type: 'string', nullable: true });
  });

  it('converts exclusiveMinimum/Maximum to inclusive bounds for integers', () => {
    const gemini = toGeminiSchema({
      type: 'integer',
      exclusiveMinimum: 0,
      exclusiveMaximum: 10,
    });
    expect(gemini).toEqual({ type: 'integer', minimum: 1, maximum: 9 });
  });

  it('renames exclusive bounds on non-integers without shifting by 1', () => {
    const gemini = toGeminiSchema({
      type: 'number',
      exclusiveMinimum: 0,
      exclusiveMaximum: 1,
    });
    expect(gemini).toEqual({ type: 'number', minimum: 0, maximum: 1 });
  });

  it('strips keywords Gemini rejects', () => {
    const gemini = toGeminiSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      additionalProperties: false,
      anyOf: [{ type: 'string' }],
      oneOf: [{ type: 'string' }],
      allOf: [{ type: 'string' }],
      const: 'x',
      pattern: '^x$',
      default: 'x',
      prefixItems: [{ type: 'string' }],
      type: 'object',
      properties: {
        name: { type: 'string', default: 'n' },
      },
    });
    expect(collectGeminiViolations(gemini)).toEqual([]);
    expect(gemini.type).toBe('object');
    expect(gemini.properties).toEqual({ name: { type: 'string' } });
  });

  it('converts LevelPlanLLM into a Gemini-safe schema', () => {
    const gemini = toGeminiSchema(LevelPlanLLM);
    expect(gemini).toEqual(LevelPlanLLMGeminiSchema);
    expect(collectGeminiViolations(gemini)).toEqual([]);

    const to = placementToSchema(gemini);
    expect(to.type).toBe('string');
    expect(to.nullable).toBe(true);
    expect(Array.isArray(to.type)).toBe(false);

    const properties = gemini.properties as Record<string, unknown>;
    const parTimeMs = properties.parTimeMs as Record<string, unknown>;
    expect(parTimeMs.type).toBe('integer');
    expect(parTimeMs.minimum).toBe(1);
    expect(parTimeMs.exclusiveMinimum).toBeUndefined();
  });

  it('matches the Gemini LevelPlanLLM schema snapshot', () => {
    expect(toGeminiSchema(LevelPlanLLM)).toMatchSnapshot();
  });

  it('maps numeric enums to string enums; zod converts the strings back', () => {
    const Rank = geminiNumericEnum([1, 2, 3]);
    const gemini = toGeminiSchema(z.object({ rank: Rank }));
    const properties = gemini.properties as Record<string, unknown>;
    expect(properties.rank).toEqual({ type: 'string', enum: ['1', '2', '3'] });
    expect(collectGeminiViolations(gemini)).toEqual([]);

    expect(Rank.parse('2')).toBe(2);
    expect(Rank.parse(2)).toBe(2);
    expect(() => Rank.parse('9')).toThrow();

    const native = z.object({
      n: z.enum({ A: 1, B: 2 }),
    });
    const nativeGemini = toGeminiSchema(native);
    const nativeProps = nativeGemini.properties as Record<string, unknown>;
    expect(nativeProps.n).toEqual({ type: 'string', enum: ['1', '2'] });
  });
});

describe('toJsonSchema still exposes the raw Zod JSON Schema', () => {
  it('is LLM-safe for the raw LevelPlanLLM export', () => {
    const jsonSchema = toJsonSchema(LevelPlanLLM);
    expect(validateLLMSafeJsonSchema(jsonSchema)).toHaveLength(0);
  });
});
