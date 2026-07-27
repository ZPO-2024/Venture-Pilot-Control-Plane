import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, participantHeaders, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("role boundary", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("an observer cannot request an export, even with valid feature entitlements", async () => {
    const pilot = await createPilotFixture(app, { participantRole: "observer" });
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const res = await app.inject({
      method: "POST",
      url: "/participant/export-requests",
      headers: participantHeaders(rawSessionToken),
      payload: {},
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("role_not_permitted");
  });

  it("an observer cannot request an extension", async () => {
    const pilot = await createPilotFixture(app, { participantRole: "observer" });
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const res = await app.inject({
      method: "POST",
      url: "/participant/extension-requests",
      headers: participantHeaders(rawSessionToken),
      payload: {},
    });

    expect(res.statusCode).toBe(403);
  });

  it("an evaluator can request an extension but not an export", async () => {
    const pilot = await createPilotFixture(app, { participantRole: "evaluator" });
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const extendRes = await app.inject({
      method: "POST",
      url: "/participant/extension-requests",
      headers: participantHeaders(rawSessionToken),
      payload: {},
    });
    expect(extendRes.statusCode).toBe(201);

    const exportRes = await app.inject({
      method: "POST",
      url: "/participant/export-requests",
      headers: participantHeaders(rawSessionToken),
      payload: {},
    });
    expect(exportRes.statusCode).toBe(403);
  });

  it("a primary_contact can request both an extension and an export", async () => {
    const pilot = await createPilotFixture(app, { participantRole: "primary_contact" });
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const exportRes = await app.inject({
      method: "POST",
      url: "/participant/export-requests",
      headers: participantHeaders(rawSessionToken),
      payload: {},
    });
    expect(exportRes.statusCode).toBe(201);
  });

  it("every role can submit feedback regardless of the export/extension boundary", async () => {
    const pilot = await createPilotFixture(app, { participantRole: "observer" });
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/feedback`,
      headers: participantHeaders(rawSessionToken),
      payload: { category: "general", comment: "observer feedback" },
    });
    expect(res.statusCode).toBe(201);
  });
});
