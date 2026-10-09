import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: [
        'src/validate/**/*.ts',
        'src/repair/**/*.ts',
        'src/generate/**/*.ts',
        'src/interact/**/*.ts',
      ],
      exclude: [
        'src/validate/**/*.spec.ts',
        'src/validate/spec-helpers.ts',
        'src/repair/**/*.spec.ts',
        'src/generate/**/*.spec.ts',
        'src/generate/test-graphs.ts',
        'src/interact/**/*.spec.ts',
      ],
      thresholds: {
        lines: 90,
      },
      reporter: ['text', 'json-summary'],
    },
  },
});
