import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, adminHeaders, participantHeaders, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("tenant isolation", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("a participant's session on pilot A cannot submit feedback against pilot B", async () => {
    const pilotA = await createPilotFixture(app, { productKey: "forgeflow" });
    const pilotB = await createPilotFixture(app, { productKey: "document-concierge" });

    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilotA.pilotId, pilotA.participantId);

    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilotB.pilotId}/feedback`,
      headers: participantHeaders(rawSessionToken),
      payload: { category: "general", comment: "should not work" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("tenant_violation");
  });

  it("a participant's session on pilot A cannot read pilot B via the admin detail route using their session token", async () => {
    const pilotA = await createPilotFixture(app);
    const pilotB = await createPilotFixture(app);
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilotA.pilotId, pilotA.participantId);

    const res = await app.inject({
      method: "GET",
      url: `/pilots/${pilotB.pilotId}`,
      headers: participantHeaders(rawSessionToken),
    });

    // The admin route only accepts the admin bearer token -- a participant
    // session token fails admin auth entirely, regardless of which pilot.
    expect(res.statusCode).toBe(401);
  });

  it("feedback correctly succeeds when the session and pilot match", async () => {
    const pilotA = await createPilotFixture(app);
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilotA.pilotId, pilotA.participantId);

    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilotA.pilotId}/feedback`,
      headers: participantHeaders(rawSessionToken),
      payload: { category: "general", comment: "works fine" },
    });

    expect(res.statusCode).toBe(201);
  });
});
