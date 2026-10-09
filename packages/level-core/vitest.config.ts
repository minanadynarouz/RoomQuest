import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/validate/**/*.ts'],
      exclude: ['src/validate/**/*.spec.ts', 'src/validate/spec-helpers.ts'],
      thresholds: {
        lines: 90,
      },
      reporter: ['text', 'json-summary'],
    },
  },
});
