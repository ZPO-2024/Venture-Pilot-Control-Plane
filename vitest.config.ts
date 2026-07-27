import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
      "tests/security/**/*.test.ts",
      "tests/scenarios/**/*.test.ts",
    ],
    // tests/security and tests/scenarios hit a real Postgres test database
    // (see docker-compose.test.yml / pnpm test:db:up) and run sequentially
    // to avoid cross-test data races on shared tables.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
