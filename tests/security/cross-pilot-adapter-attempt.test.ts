import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { AdapterTenantViolationError } from "@venture-pilot/shared";
import { verifyTenantChain, assertEnvironmentBelongsToPilot } from "@venture-pilot/provisioning";
import { createTestApp, createPilotFixture, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("cross-pilot adapter attempt", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects an AdapterContext claiming pilot A's identity but pointing at pilot B's environment", async () => {
    const pilotA = await createPilotFixture(app, { productKey: "forgeflow" });
    const pilotB = await createPilotFixture(app, { productKey: "forgeflow" });

    const chainA = await verifyTenantChain(prisma, pilotA.pilotId);
    const envB = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { pilotProgramId: pilotB.pilotId } });

    expect(() =>
      assertEnvironmentBelongsToPilot(chainA, {
        pilotProgramId: chainA.pilotProgramId,
        pilotOrgId: chainA.pilotOrgId,
        environmentId: envB.id, // forged: belongs to pilot B, not A
      }),
    ).toThrow(AdapterTenantViolationError);
  });

  it("accepts a correctly-scoped context for its own pilot", async () => {
    const pilotA = await createPilotFixture(app, { productKey: "forgeflow" });
    const chainA = await verifyTenantChain(prisma, pilotA.pilotId);

    expect(() =>
      assertEnvironmentBelongsToPilot(chainA, {
        pilotProgramId: chainA.pilotProgramId,
        pilotOrgId: chainA.pilotOrgId,
        environmentId: chainA.environmentId,
      }),
    ).not.toThrow();
  });

  it("verifyTenantChain re-derives from live DB state rather than trusting any input", async () => {
    const pilot = await createPilotFixture(app, { productKey: "document-concierge" });
    const chain = await verifyTenantChain(prisma, pilot.pilotId);
    expect(chain.pilotProgramId).toBe(pilot.pilotId);
    expect(chain.adapterKey).toBe("document-concierge-demo");
  });
});
