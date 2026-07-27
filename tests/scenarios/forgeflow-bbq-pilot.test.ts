import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, adminHeaders, participantHeaders } from "../helpers/testServer.js";

/**
 * The ForgeFlow "Example BBQ Pilot" demonstration scenario from
 * docs/DEMO_SCRIPT.md, run as a real, assertable end-to-end test against
 * the actual API and a real Postgres database -- not a script that merely
 * prints output. Steps 1-2 (register the product/version) are assumed
 * already done by `pnpm db:seed` (see the precondition check below); every
 * other step is a live HTTP call.
 */

let app: FastifyInstance;
let pilotId: string;
let participantId: string;
let rawInvitationToken: string;
let rawSessionToken: string;

describe("demo scenario: ForgeFlow Example BBQ Pilot", () => {
  beforeAll(() => {
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("step 1-2: ForgeFlow and a demonstration version are registered (via pnpm db:seed)", async () => {
    const res = await app.inject({ method: "GET", url: "/products", headers: adminHeaders() });
    expect(res.statusCode).toBe(200);
    const products = res.json() as { key: string; versions: { version: string; adapterKey: string }[] }[];
    const forgeflow = products.find((p) => p.key === "forgeflow");
    expect(forgeflow, "forgeflow product not found -- run `pnpm db:seed` before the demo scenarios").toBeTruthy();
    expect(forgeflow!.versions.some((v) => v.adapterKey === "forgeflow-kds-demo")).toBe(true);
  });

  it("step 3-4: creates a synthetic mobile-food pilot from a template and provisions it", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/pilots",
      headers: adminHeaders(),
      payload: {
        productKey: "forgeflow",
        productVersion: "0.1.0-demo",
        templateKey: "mobile-bbq-demo",
        organization: { name: "Example BBQ Pilot Org", primaryContactEmail: "prospect@example.com" },
        name: "Example BBQ Pilot",
        durationDays: 7,
        environmentTypeKey: "sandbox",
        featureKeys: ["order_routing", "kds_stations", "offline_reconnect"],
        participants: [{ email: "participant@example-bbq.com", role: "primary_contact" }],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const pilot = createRes.json();
    pilotId = pilot.id;
    participantId = pilot.participants[0].id;
    expect(pilot.status).toBe("draft");

    const provisionRes = await app.inject({
      method: "POST",
      url: `/pilots/${pilotId}/provision`,
      headers: adminHeaders(),
      payload: {},
    });
    expect(provisionRes.statusCode).toBe(200);
    const result = provisionRes.json();
    expect(result.recordCounts).toBeTruthy();
    expect(result.recordCounts.orders).toBeGreaterThan(0);

    const pilotAfter = await prisma.pilotProgram.findUniqueOrThrow({ where: { id: pilotId } });
    expect(pilotAfter.status).toBe("ready");
  });

  it("step 5: issues a seven-day invitation", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilotId}/invitations`,
      headers: adminHeaders(),
      payload: { participantId, expiresInHours: 7 * 24 },
    });
    expect(res.statusCode).toBe(201);
    const invite = res.json();
    rawInvitationToken = invite.rawToken;
    const hoursUntilExpiry = (new Date(invite.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60);
    expect(hoursUntilExpiry).toBeGreaterThan(6.9 * 24);
    expect(hoursUntilExpiry).toBeLessThanOrEqual(7 * 24);
  });

  it("step 6: redeems the invitation as a participant", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/invitations/${rawInvitationToken}/redeem`,
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    rawSessionToken = res.json().rawSessionToken;

    const pilotAfter = await prisma.pilotProgram.findUniqueOrThrow({ where: { id: pilotId } });
    expect(pilotAfter.status).toBe("active");
  });

  it("step 7: enters the synthetic product projection", async () => {
    const res = await app.inject({ method: "GET", url: "/participant/session", headers: participantHeaders(rawSessionToken) });
    expect(res.statusCode).toBe(200);
    const session = res.json();
    expect(session.productName).toContain("ForgeFlow");
    expect(session.syntheticDataNotice).toMatch(/synthetic/i);
    expect(session.visibleFeatureKeys).toEqual(expect.arrayContaining(["order_routing", "kds_stations"]));

    const eventRes = await app.inject({
      method: "POST",
      url: "/participant/events",
      headers: participantHeaders(rawSessionToken),
      payload: { type: "product_opened", metadata: {} },
    });
    expect(eventRes.statusCode).toBe(201);
  });

  it("step 8: records completion of the primary demonstration workflow", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/participant/events",
      headers: participantHeaders(rawSessionToken),
      payload: { type: "demonstration_workflow_completed", metadata: { workflow: "take-order-to-pickup" } },
    });
    expect(res.statusCode).toBe(201);
  });

  it("step 9: submits feedback", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilotId}/feedback`,
      headers: participantHeaders(rawSessionToken),
      payload: { category: "general", rating: 5, comment: "The KDS routing was intuitive during a rush." },
    });
    expect(res.statusCode).toBe(201);
  });

  it("step 10: extends the pilot", async () => {
    const before = await prisma.pilotProgram.findUniqueOrThrow({ where: { id: pilotId } });
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilotId}/extend`,
      headers: adminHeaders(),
      payload: { additionalDays: 7, reason: "Prospect wants another week to evaluate offline/reconnect handling" },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.pilotProgram.findUniqueOrThrow({ where: { id: pilotId } });
    expect(after.status).toBe("extended");
    expect(after.expiresAt!.getTime()).toBeGreaterThan(before.expiresAt!.getTime());
  });

  it("step 11: revokes access", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilotId}/revoke`,
      headers: adminHeaders(),
      payload: { reason: "Demonstration scenario complete; revoking before export/destroy" },
    });
    expect(res.statusCode).toBe(200);
    const pilot = await prisma.pilotProgram.findUniqueOrThrow({ where: { id: pilotId } });
    expect(pilot.status).toBe("revoked");
  });

  it("step 12: verifies the previous session can no longer enter", async () => {
    const res = await app.inject({ method: "GET", url: "/participant/session", headers: participantHeaders(rawSessionToken) });
    expect(res.statusCode).toBe(401);
  });

  it("step 13: exports the pilot receipt", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilotId}/export`,
      headers: adminHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.checksumDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(body.storageRef).toContain(pilotId);
  });

  it("step 14: destroys the demonstration environment", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilotId}/destroy`,
      headers: adminHeaders(),
      payload: { reason: "Demonstration scenario complete" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.receiptDigest).toMatch(/^[0-9a-f]{64}$/);

    const [pilot, environment] = await Promise.all([
      prisma.pilotProgram.findUniqueOrThrow({ where: { id: pilotId } }),
      prisma.pilotEnvironment.findUniqueOrThrow({ where: { pilotProgramId: pilotId } }),
    ]);
    expect(pilot.status).toBe("destroyed");
    expect(environment.status).toBe("destroyed");
  });
});
