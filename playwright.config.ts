import { defineConfig, devices } from "@playwright/test";

// Requires the API + admin + participant-portal already running (either
// `pnpm dev` or `docker compose up`) against a migrated + seeded database
// -- see docs/DEPLOYMENT.md. Not auto-started here: this suite drives real
// HTTP + a real Postgres-backed API, which webServer's health-check
// lifecycle isn't a good fit for in this repo's local/demo setup.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : undefined,
      },
    },
  ],
});
