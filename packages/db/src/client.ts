import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __pilotPrismaClient: PrismaClient | undefined;
}

// Reuse a single client across hot-reloads / repeated imports in dev and
// tests instead of exhausting the Postgres connection pool.
export const prisma: PrismaClient =
  globalThis.__pilotPrismaClient ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__pilotPrismaClient = prisma;
}
