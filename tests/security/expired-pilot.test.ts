import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, participantHeaders, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("expired pilot", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("denies access once PilotProgram.expiresAt has passed, even though the session/grant rows themselves are still 'active'", async () => {
    const pilot = await createPilotFixture(app);
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    // Simulate the worker sweep not having run yet: the pilot's expiry has
    // passed, but nothing has flipped status/grant/session rows to expired.
    await prisma.pilotProgram.update({ where: { id: pilot.pilotId }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    const res = await app.inject({ method: "GET", url: "/participant/session", headers: participantHeaders(rawSessionToken) });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("pilot_access_denied");
  });

  it("denies access when the pilot status itself is not access-permitted (e.g. suspended)", async () => {
    const pilot = await createPilotFixture(app);
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    await prisma.pilotProgram.update({ where: { id: pilot.pilotId }, data: { status: "suspended" } });

    const res = await app.inject({ method: "GET", url: "/participant/session", headers: participantHeaders(rawSessionToken) });
    expect(res.statusCode).toBe(403);
  });
});
