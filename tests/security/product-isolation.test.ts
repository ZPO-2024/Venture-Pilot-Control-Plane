import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, resetPilotData, adminHeaders } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("product isolation", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("two pilots of the same product get independently provisioned, non-shared environments", async () => {
    const pilotA = await createPilotFixture(app, { productKey: "forgeflow" });
    const pilotB = await createPilotFixture(app, { productKey: "forgeflow" });

    const envA = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { pilotProgramId: pilotA.pilotId } });
    const envB = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { pilotProgramId: pilotB.pilotId } });

    expect(envA.id).not.toEqual(envB.id);
    expect(envA.adapterState).not.toBe(envB.adapterState); // distinct object identity from independent provisioning runs

    // Resetting pilot A must not touch pilot B's environment or dataset pointer.
    await app.inject({
      method: "POST",
      url: `/pilots/${pilotA.pilotId}/reset`,
      headers: adminHeaders(),
      payload: { reason: "isolation test reset" },
    });

    const envBAfter = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { pilotProgramId: pilotB.pilotId } });
    expect(envBAfter.currentDatasetVersionId).toEqual(envB.currentDatasetVersionId);
  });

  it("each pilot's provisioning run is scoped to its own pilotEnvironmentId", async () => {
    const pilotA = await createPilotFixture(app, { productKey: "document-concierge" });
    const pilotB = await createPilotFixture(app, { productKey: "document-concierge" });

    const runsA = await prisma.provisioningRun.findMany({ where: { pilotProgramId: pilotA.pilotId } });
    const runsB = await prisma.provisioningRun.findMany({ where: { pilotProgramId: pilotB.pilotId } });

    expect(runsA.length).toBeGreaterThan(0);
    expect(runsB.length).toBeGreaterThan(0);
    const envA = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { pilotProgramId: pilotA.pilotId } });
    const envB = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { pilotProgramId: pilotB.pilotId } });
    expect(runsA.every((r) => r.pilotEnvironmentId === envA.id)).toBe(true);
    expect(runsB.every((r) => r.pilotEnvironmentId === envB.id)).toBe(true);
  });
});
