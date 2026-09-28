import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Convert a Zod schema to JSON Schema
 * Used for LangChain withStructuredOutput
 *
 * @param schema - Zod schema to convert
 * @param options - Conversion options
 * @returns JSON Schema object
 */
export function toJsonSchema(
  // Using any is necessary for compatibility with zod-to-json-schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
  options?: {
    name?: string;
    description?: string;
  },
): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return zodToJsonSchema(schema, {
    name: options?.name,
    $refStrategy: 'none', // Inline all definitions for LLM compatibility
  });
}

/**
 * Validate that a JSON schema is safe for LLM structured output
 * Checks for patterns that some LLM providers don't support well
 *
 * Returns validation errors if any are found
 */
export function validateLLMSafeJsonSchema(
  jsonSchema: Record<string, unknown>,
): string[] {
  const errors: string[] = [];

  function walk(obj: unknown, path: string): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    const record = obj as Record<string, unknown>;

    // Check for unsupported features
    if ('prefixItems' in record) {
      errors.push(`${path}: 'prefixItems' found (use arrays instead of tuples)`);
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
