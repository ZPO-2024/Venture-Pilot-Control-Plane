import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, adminHeaders, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("conversion packet generation", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("compiles trial dates, participants, features, feedback, and moves the pilot to conversion_review", async () => {
    const pilot = await createPilotFixture(app, { productKey: "forgeflow", featureKeys: ["order_routing"] });
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/feedback`,
      headers: { authorization: `Bearer ${rawSessionToken}`, "content-type": "application/json" },
      payload: { category: "general", rating: 5, comment: "Loved it" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/conversion`,
      headers: adminHeaders(),
      payload: { recommendedPlan: "Move to production sandbox", unresolvedRisks: "None identified" },
    });

    expect(res.statusCode).toBe(201);
    const record = res.json();
    expect(record.status).toBe("ready_for_review");
    expect(record.packetJson.product).toBe("ForgeFlow / Universal KDS Bridge");
    expect(record.packetJson.featuresUsed).toContain("order_routing");
    expect(record.packetJson.feedback).toHaveLength(1);
    expect(record.packetJson.recommendedProductionPlan).toBe("Move to production sandbox");

    const pilotAfter = await prisma.pilotProgram.findUniqueOrThrow({ where: { id: pilot.pilotId } });
    expect(pilotAfter.status).toBe("conversion_review");
  });

  it("regenerating the packet updates the existing record instead of creating a second one", async () => {
    const pilot = await createPilotFixture(app);
    await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    await app.inject({ method: "POST", url: `/pilots/${pilot.pilotId}/conversion`, headers: adminHeaders(), payload: {} });
    await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/conversion`,
      headers: adminHeaders(),
      payload: { recommendedPlan: "Updated plan" },
    });

    const records = await prisma.conversionRecord.findMany({ where: { pilotProgramId: pilot.pilotId } });
    expect(records).toHaveLength(1);
    expect(records[0]!.recommendedPlan).toBe("Updated plan");
  });

  it("does not conflict with an already-converted pilot's terminal-adjacent status", async () => {
    const pilot = await createPilotFixture(app);
    await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);
    await app.inject({ method: "POST", url: `/pilots/${pilot.pilotId}/conversion`, headers: adminHeaders(), payload: {} });

    // Regenerating while already in conversion_review must not attempt an
    // invalid active/extended -> conversion_review transition again.
    const res = await app.inject({ method: "POST", url: `/pilots/${pilot.pilotId}/conversion`, headers: adminHeaders(), payload: {} });
    expect(res.statusCode).toBe(201);
  });
});
