import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, adminHeaders, participantHeaders, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("revoked grant", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("a session tied to a directly-revoked access grant is denied", async () => {
    const pilot = await createPilotFixture(app);
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const grant = await prisma.accessGrant.findFirstOrThrow({ where: { pilotProgramId: pilot.pilotId } });
    await prisma.accessGrant.update({ where: { id: grant.id }, data: { status: "revoked", revokedAt: new Date(), revokedReason: "test" } });

    const res = await app.inject({ method: "GET", url: "/participant/session", headers: participantHeaders(rawSessionToken) });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("session_invalid");
  });

  it("an expired access grant (independent of pilot expiry) is denied", async () => {
    const pilot = await createPilotFixture(app);
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const grant = await prisma.accessGrant.findFirstOrThrow({ where: { pilotProgramId: pilot.pilotId } });
    await prisma.accessGrant.update({ where: { id: grant.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await app.inject({ method: "GET", url: "/participant/session", headers: participantHeaders(rawSessionToken) });
    expect(res.statusCode).toBe(401);
  });

  it("admin revoking the pilot invalidates every outstanding grant", async () => {
    const pilot = await createPilotFixture(app);
    await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/revoke`,
      headers: adminHeaders(),
      payload: { reason: "test revoke" },
    });

    const grants = await prisma.accessGrant.findMany({ where: { pilotProgramId: pilot.pilotId } });
    expect(grants.every((g) => g.status === "revoked")).toBe(true);
  });
});
