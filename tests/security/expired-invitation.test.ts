import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, adminHeaders, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("expired invitation", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects redemption once the invitation's expiresAt has passed", async () => {
    const pilot = await createPilotFixture(app);
    const inviteRes = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/invitations`,
      headers: adminHeaders(),
      payload: { participantId: pilot.participantId, expiresInHours: 1 },
    });
    const invite = inviteRes.json();

    // Simulate real time having passed without sleeping the test.
    await prisma.invitation.update({
      where: { id: invite.invitationId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const redeemRes = await app.inject({
      method: "POST",
      url: `/invitations/${invite.rawToken}/redeem`,
      headers: { "content-type": "application/json" },
      payload: {},
    });

    expect(redeemRes.statusCode).toBe(410);
    expect(redeemRes.json().error.code).toBe("invitation_expired");

    const session = await prisma.session.findFirst({ where: { participantId: pilot.participantId } });
    expect(session).toBeNull();
  });
});
