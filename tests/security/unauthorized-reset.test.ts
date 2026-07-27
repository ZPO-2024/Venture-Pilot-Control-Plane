import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, participantHeaders, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("unauthorized reset", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects a reset request with no auth header at all", async () => {
    const pilot = await createPilotFixture(app);
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/reset`,
      headers: { "content-type": "application/json" },
      payload: { reason: "no auth" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a reset request authenticated as a participant, even one that belongs to this exact pilot", async () => {
    const pilot = await createPilotFixture(app);
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/reset`,
      headers: participantHeaders(rawSessionToken),
      payload: { reason: "participant trying to reset" },
    });
    expect(res.statusCode).toBe(401);
  });
});
