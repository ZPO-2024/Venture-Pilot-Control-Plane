import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { DatasetVersionMismatchError } from "@venture-pilot/shared";
import { runReset } from "@venture-pilot/provisioning";
import { createTestApp, createPilotFixture, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("dataset version mismatch", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("refuses to (re-)load a dataset whose registered digest no longer matches its fixture content", async () => {
    const pilot = await createPilotFixture(app, { productKey: "forgeflow" });

    const environment = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { pilotProgramId: pilot.pilotId } });
    const datasetVersion = await prisma.datasetVersion.findUniqueOrThrow({ where: { id: environment.currentDatasetVersionId! } });

    // Simulate tampering / drift: the registered digest no longer matches
    // the actual fixture file on disk. This mutates a row in the *shared*
    // seeded product catalog (resetPilotData() deliberately leaves it
    // alone), so it must be restored afterward or every later test that
    // provisions a forgeflow pilot breaks.
    await prisma.datasetVersion.update({ where: { id: datasetVersion.id }, data: { digest: "0000000000tampered0000000000" } });

    try {
      await expect(
        runReset(prisma, {
          pilotProgramId: pilot.pilotId,
          actor: { type: "admin", id: "admin" },
          sourceRoute: "test",
          idempotencyKey: `mismatch-test:${pilot.pilotId}`,
          reason: "test",
        }),
      ).rejects.toThrow(DatasetVersionMismatchError);

      const run = await prisma.provisioningRun.findUnique({ where: { idempotencyKey: `mismatch-test:${pilot.pilotId}` } });
      expect(run?.status).toBe("failed");
    } finally {
      await prisma.datasetVersion.update({ where: { id: datasetVersion.id }, data: { digest: datasetVersion.digest } });
    }
  });
});
