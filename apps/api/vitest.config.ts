import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
    // Integration suites share one embedded Postgres (and the installer
    // suite runs real astro builds) — parallel worker files made results
    // flaky on this machine. Serialize files; the suite stays ~15s.
    fileParallelism: false,
  },
});
