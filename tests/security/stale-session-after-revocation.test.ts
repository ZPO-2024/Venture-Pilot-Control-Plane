import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, adminHeaders, participantHeaders, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("stale session after revocation", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("a session token that worked before an admin revoke fails immediately after, with no client-side change needed to trigger it", async () => {
    const pilot = await createPilotFixture(app);
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const before = await app.inject({ method: "GET", url: "/participant/session", headers: participantHeaders(rawSessionToken) });
    expect(before.statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/revoke`,
      headers: adminHeaders(),
      payload: { reason: "simulate operator revoke while participant is mid-session" },
    });

    // Same raw token, same cached client state -- the exact scenario a
    // client-side cache or an old browser tab would replay.
    const after = await app.inject({ method: "GET", url: "/participant/session", headers: participantHeaders(rawSessionToken) });
    expect(after.statusCode).toBe(401);

    const usageEventAttempt = await app.inject({
      method: "POST",
      url: "/participant/events",
      headers: participantHeaders(rawSessionToken),
      payload: { type: "product_opened", metadata: {} },
    });
    expect(usageEventAttempt.statusCode).toBe(401);
  });

  it("revoking one pilot's sessions does not affect a different pilot's active session", async () => {
    const pilotA = await createPilotFixture(app);
    const pilotB = await createPilotFixture(app);
    const { rawSessionToken: tokenA } = await issueAndRedeemInvitation(app, pilotA.pilotId, pilotA.participantId);
    const { rawSessionToken: tokenB } = await issueAndRedeemInvitation(app, pilotB.pilotId, pilotB.participantId);

    await app.inject({
      method: "POST",
      url: `/pilots/${pilotA.pilotId}/revoke`,
      headers: adminHeaders(),
      payload: { reason: "revoke pilot A only" },
    });

    const resA = await app.inject({ method: "GET", url: "/participant/session", headers: participantHeaders(tokenA) });
    const resB = await app.inject({ method: "GET", url: "/participant/session", headers: participantHeaders(tokenB) });
    expect(resA.statusCode).toBe(401);
    expect(resB.statusCode).toBe(200);
  });
});
