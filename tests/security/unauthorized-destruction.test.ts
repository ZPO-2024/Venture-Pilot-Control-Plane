import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, participantHeaders, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("unauthorized destruction", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects destruction with no admin auth", async () => {
    const pilot = await createPilotFixture(app);
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/destroy`,
      headers: { "content-type": "application/json" },
      payload: { reason: "no auth" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects destruction authenticated as a participant", async () => {
    const pilot = await createPilotFixture(app);
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/destroy`,
      headers: participantHeaders(rawSessionToken),
      payload: { reason: "participant trying to destroy" },
    });
    expect(res.statusCode).toBe(401);

    const environment = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { pilotProgramId: pilot.pilotId } });
    expect(environment.status).not.toBe("destroyed");
  });
});
