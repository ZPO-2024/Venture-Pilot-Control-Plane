import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, participantHeaders, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("unauthorized export", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects a full export (POST /pilots/:id/export) with no admin auth", async () => {
    const pilot = await createPilotFixture(app);
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/export`,
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a full export authenticated only as a participant of that same pilot", async () => {
    const pilot = await createPilotFixture(app, { participantRole: "primary_contact" });
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/export`,
      headers: participantHeaders(rawSessionToken),
      payload: {},
    });
    expect(res.statusCode).toBe(401);

    // The participant's own *request* path is separate (pending, not
    // self-executed) -- confirm that one is available to them and does not
    // itself perform the privileged export.
    const requestRes = await app.inject({
      method: "POST",
      url: "/participant/export-requests",
      headers: participantHeaders(rawSessionToken),
      payload: {},
    });
    expect(requestRes.statusCode).toBe(201);
    expect(requestRes.json().status).toBe("pending");
  });
});
