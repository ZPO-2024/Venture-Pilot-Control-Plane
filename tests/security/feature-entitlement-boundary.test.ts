import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { assertFeatureEntitled, isFeatureEnabled } from "@venture-pilot/entitlements";
import { FeatureNotEntitledError } from "@venture-pilot/shared";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, participantHeaders, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("feature entitlement boundary", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("a feature not enabled for the pilot is excluded from the participant's visible feature set, for every role", async () => {
    // order_routing defaults enabled on ForgeFlow; offline_reconnect defaults disabled and is not requested here.
    const pilot = await createPilotFixture(app, { productKey: "forgeflow", featureKeys: ["order_routing"] });
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    const res = await app.inject({ method: "GET", url: "/participant/session", headers: participantHeaders(rawSessionToken) });
    const body = res.json();

    expect(body.visibleFeatureKeys).toContain("order_routing");
    expect(body.visibleFeatureKeys).not.toContain("offline_reconnect");
  });

  it("assertFeatureEntitled throws for a disabled feature regardless of role", async () => {
    const pilot = await createPilotFixture(app, { productKey: "forgeflow", featureKeys: [], participantRole: "primary_contact" });
    await expect(assertFeatureEntitled(prisma, pilot.pilotId, "offline_reconnect")).rejects.toThrow(FeatureNotEntitledError);
  });

  it("a default-disabled feature stays disabled unless explicitly requested at pilot creation, and enabling it only affects that pilot", async () => {
    const withoutOverride = await createPilotFixture(app, { productKey: "document-concierge", featureKeys: [] });
    const withOverride = await createPilotFixture(app, { productKey: "document-concierge", featureKeys: ["duplicate_detection"] });

    expect(await isFeatureEnabled(prisma, withoutOverride.pilotId, "duplicate_detection")).toBe(false);
    expect(await isFeatureEnabled(prisma, withoutOverride.pilotId, "document_intake")).toBe(true); // default-enabled feature

    expect(await isFeatureEnabled(prisma, withOverride.pilotId, "duplicate_detection")).toBe(true);
  });
});
