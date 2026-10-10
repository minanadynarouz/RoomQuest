import { z } from 'zod';

/**
 * Convert a Zod schema to JSON Schema
 * Uses Zod 4's native toJSONSchema API
 *
 * @param schema - Zod schema to convert
 * @param _options - Legacy options parameter (unused, kept for API compatibility)
 * @returns JSON Schema object
 */
export function toJsonSchema<T>(
  schema: z.ZodType<T>,
  _options?: {
    name?: string;
    description?: string;
  }
): Record<string, unknown> {
  // Zod 4's toJSONSchema doesn't accept options, just the schema
  return z.toJSONSchema(schema);
}

const GEMINI_STRIP_KEYS = new Set([
  '$schema',
  'additionalProperties',
  'anyOf',
  'oneOf',
  'allOf',
  'const',
  'pattern',
  'default',
  'prefixItems',
]);

function isZodSchema(schema: object): schema is z.ZodType {
  return (
    'safeParse' in schema &&
    typeof (schema as { safeParse?: unknown }).safeParse === 'function'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function stringifyEnumValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Pull const/enum literals out of a Zod `anyOf`/`oneOf` union, if every branch is a literal. */
function literalValuesFromUnion(union: unknown): unknown[] | undefined {
  if (!Array.isArray(union) || union.length === 0) {
    return undefined;
  }
  const values: unknown[] = [];
  for (const item of union) {
    if (!isRecord(item)) {
      return undefined;
    }
    if ('const' in item) {
      values.push(item.const);
      continue;
    }
    if (Array.isArray(item.enum) && item.enum.length > 0) {
      for (const entry of item.enum) {
        values.push(entry);
      }
      continue;
    }
    return undefined;
  }
  return values;
}

/**
 * Gemini only accepts string enums. Zod numeric enums (`z.enum({ A: 1 })`) and
 * literal unions (`z.union([z.literal(1), …])`) must parse the string Gemini
 * returns (`"1"`) back to the original number.
 */
export function geminiNumericEnum<T extends number>(
  values: readonly [T, T, ...T[]]
): z.ZodType<T> {
  const asString = new Set(values.map(String));
  const literals = values.map((value) => z.literal(value));
  const inner = z.union(
    literals as [z.ZodLiteral<T>, z.ZodLiteral<T>, ...z.ZodLiteral<T>[]]
  );
  return z.preprocess((value: unknown) => {
    if (typeof value === 'string' && asString.has(value)) {
      return Number(value);
    }
    return value;
  }, inner);
}

/**
 * Gemini `responseSchema` rejects JSON Schema features that Zod / LangChain
 * emit by default: type unions like `["string","null"]` ("Proto field is not
 * repeating, cannot start list"), `exclusiveMinimum` from `.positive()`, and
 * keywords such as `$schema` / `additionalProperties` / `anyOf`.
 *
 * Rewrite those into Gemini-safe shapes (`type` + `nullable: true`, inclusive
 * `minimum` / `maximum`) and strip the rest. Zod validation of the parsed
 * object is unchanged — this is only the on-the-wire schema.
 */
export function toGeminiSchema(
  schema: z.ZodType | Record<string, unknown>
): Record<string, unknown> {
  const json = isZodSchema(schema) ? toJsonSchema(schema) : schema;
  const rewritten = rewriteForGemini(json);
  if (!isRecord(rewritten)) {
    return {};
  }
  return rewritten;
}

function rewriteForGemini(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(rewriteForGemini);
  }
  if (!isRecord(value)) {
    return value;
  }

  const literalEnum =
    literalValuesFromUnion(value.anyOf) ?? literalValuesFromUnion(value.oneOf);

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (GEMINI_STRIP_KEYS.has(key)) {
      continue;
    }
    out[key] = rewriteForGemini(child);
  }

  if (literalEnum !== undefined) {
    out.enum = literalEnum.map(stringifyEnumValue);
    out.type = 'string';
  }

  if (Array.isArray(out.enum)) {
    const hasNonString = out.enum.some(
      (item) => typeof item === 'number' || typeof item === 'boolean'
    );
    if (hasNonString) {
      out.enum = out.enum.map(stringifyEnumValue);
      out.type = 'string';
    }
  }

  if (Array.isArray(out.type)) {
    const types = out.type.filter(
      (item): item is string => typeof item === 'string'
    );
    const hasNull = types.includes('null');
    const nonNull = types.filter((item) => item !== 'null');
    out.type = nonNull[0] ?? 'string';
    if (hasNull) {
      out.nullable = true;
    }
  }

  const isInteger = out.type === 'integer';
  if ('exclusiveMinimum' in out) {
    const exclusiveMin = asNumber(out.exclusiveMinimum);
    delete out.exclusiveMinimum;
    if (exclusiveMin !== undefined) {
      const next = isInteger ? exclusiveMin + 1 : exclusiveMin;
      const existing = asNumber(out.minimum);
      out.minimum = existing === undefined ? next : Math.max(existing, next);
    }
  }
  if ('exclusiveMaximum' in out) {
    const exclusiveMax = asNumber(out.exclusiveMaximum);
    delete out.exclusiveMaximum;
    if (exclusiveMax !== undefined) {
      const next = isInteger ? exclusiveMax - 1 : exclusiveMax;
      const existing = asNumber(out.maximum);
      out.maximum = existing === undefined ? next : Math.min(existing, next);
    }
  }

  return out;
}

/**
 * Validate that a JSON schema is safe for LLM structured output
 * Checks for patterns that some LLM providers don't support well
 *
 * Returns validation errors if any are found
 */
export function validateLLMSafeJsonSchema(
  jsonSchema: Record<string, unknown>
): string[] {
  const errors: string[] = [];

  function walk(obj: unknown, path: string): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    const record = obj as Record<string, unknown>;

    // Check for unsupported features
    if ('prefixItems' in record) {
      errors.push(
        `${path}: 'prefixItems' found (use arrays instead of tuples)`
      );
    }
    if ('pattern' in record) {
      errors.push(`${path}: 'pattern' (regex) found`);
    }
    if ('anyOf' in record) {
      errors.push(`${path}: 'anyOf' (union) found`);
    }
    if ('oneOf' in record) {
      errors.push(`${path}: 'oneOf' (discriminated union) found`);
    }
    if ('default' in record) {
      errors.push(`${path}: 'default' value found`);
    }

    // Recurse into nested objects
    for (const [key, value] of Object.entries(record)) {
      const newPath = path ? `${path}.${key}` : key;
      if (Array.isArray(value)) {
        value.forEach((item, i) => {
          walk(item, `${newPath}[${String(i)}]`);
        });
      } else {
        walk(value, newPath);
      }
    }
  }

  walk(jsonSchema, '');
  return errors;
}
