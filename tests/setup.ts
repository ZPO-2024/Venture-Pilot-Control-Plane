import { existsSync } from "node:fs";
import path from "node:path";

// Loads .env.test (gitignored, created from .env.test.example) so
// `pnpm test` works without requiring env vars to be exported manually.
// Node 20.12+/22 ships process.loadEnvFile() natively -- no dotenv dep needed.
const envTestPath = path.resolve(process.cwd(), ".env.test");
if (existsSync(envTestPath)) {
  process.loadEnvFile(envTestPath);
}
