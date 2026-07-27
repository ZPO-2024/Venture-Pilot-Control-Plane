import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, resetPilotData, adminHeaders } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("reused invitation", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("a second redemption of the same token is rejected, even though the first succeeded", async () => {
    const pilot = await createPilotFixture(app);
    const { rawInvitationToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const secondRedeemRes = await app.inject({
      method: "POST",
      url: `/invitations/${rawInvitationToken}/redeem`,
      headers: { "content-type": "application/json" },
      payload: {},
    });

    expect(secondRedeemRes.statusCode).toBe(409);
    expect(secondRedeemRes.json().error.code).toBe("invitation_already_redeemed");
  });

  it("only one AccessGrant/Session exists after two redemption attempts", async () => {
    const pilot = await createPilotFixture(app);
    const { rawInvitationToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    await app.inject({
      method: "POST",
      url: `/invitations/${rawInvitationToken}/redeem`,
      headers: { "content-type": "application/json" },
      payload: {},
    });

    const grants = await prisma.accessGrant.findMany({ where: { pilotProgramId: pilot.pilotId } });
    expect(grants).toHaveLength(1);
  });

  it("concurrent redemption attempts against the same token only let one succeed", async () => {
    const pilot = await createPilotFixture(app);
    const inviteRes = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/invitations`,
      headers: adminHeaders(),
      payload: { participantId: pilot.participantId, expiresInHours: 168 },
    });
    const invite = inviteRes.json();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({
          method: "POST",
          url: `/invitations/${invite.rawToken}/redeem`,
          headers: { "content-type": "application/json" },
          payload: {},
        }),
      ),
    );

    const succeeded = results.filter((r) => r.statusCode === 201);
    expect(succeeded).toHaveLength(1);
  });
});
