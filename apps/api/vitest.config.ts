import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: [
      'src/**/*.spec.ts',
      'test/**/*.spec.ts',
      'eval/**/*.spec.ts',
      'smoke/**/*.spec.ts',
    ],
    pool: 'forks',
    isolate: true,
    // Postgres integration specs share one database and wipe tables in
    // beforeEach. Parallel files delete each other's SessionResult rows.
    fileParallelism: false,
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
