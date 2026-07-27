import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, adminHeaders, participantHeaders } from "../helpers/testServer.js";

/**
 * The same 14-step demonstration lifecycle as
 * forgeflow-bbq-pilot.test.ts, run against Sovereign Document Concierge
 * instead -- this is the product-neutrality proof: nothing here is
 * ForgeFlow-specific, only the product key, template, and expected
 * feature/record shapes differ.
 */

let app: FastifyInstance;
let pilotId: string;
let participantId: string;
let rawInvitationToken: string;
let rawSessionToken: string;

describe("demo scenario: Document Concierge pilot (product-neutrality proof)", () => {
  beforeAll(() => {
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("step 1-2: Document Concierge and a demonstration version are registered (via pnpm db:seed)", async () => {
    const res = await app.inject({ method: "GET", url: "/products", headers: adminHeaders() });
    expect(res.statusCode).toBe(200);
    const products = res.json() as { key: string; versions: { version: string; adapterKey: string }[] }[];
    const docConcierge = products.find((p) => p.key === "document-concierge");
    expect(docConcierge, "document-concierge product not found -- run `pnpm db:seed` before the demo scenarios").toBeTruthy();
    expect(docConcierge!.versions.some((v) => v.adapterKey === "document-concierge-demo")).toBe(true);
  });

  it("step 3-4: creates a synthetic professional-office pilot from a template and provisions it", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/pilots",
      headers: adminHeaders(),
      payload: {
        productKey: "document-concierge",
        productVersion: "0.1.0-demo",
        templateKey: "professional-office-demo",
        organization: { name: "Example Professional Office Org", primaryContactEmail: "prospect@example-office.com" },
        name: "Example Document Concierge Pilot",
        durationDays: 7,
        environmentTypeKey: "sandbox",
        featureKeys: ["document_intake", "deadline_tracking", "duplicate_detection"],
        participants: [{ email: "participant@example-office.com", role: "primary_contact" }],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const pilot = createRes.json();
    pilotId = pilot.id;
    participantId = pilot.participants[0].id;

    const provisionRes = await app.inject({
      method: "POST",
      url: `/pilots/${pilotId}/provision`,
      headers: adminHeaders(),
      payload: {},
    });
    expect(provisionRes.statusCode).toBe(200);
    const result = provisionRes.json();
    expect(result.recordCounts.invoices).toBeGreaterThan(0);
    expect(result.recordCounts.upcomingDeadlines).toBeGreaterThan(0);

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
    rawInvitationToken = res.json().rawToken;
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
    expect(session.productName).toContain("Document Concierge");
    expect(session.syntheticDataNotice).toMatch(/synthetic/i);
    expect(session.visibleFeatureKeys).toEqual(expect.arrayContaining(["document_intake", "deadline_tracking"]));
  });

  it("step 8: records completion of the primary demonstration workflow", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/participant/events",
      headers: participantHeaders(rawSessionToken),
      payload: { type: "demonstration_workflow_completed", metadata: { workflow: "intake-to-deadline-tracking" } },
    });
    expect(res.statusCode).toBe(201);
  });

  it("step 9: submits feedback", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilotId}/feedback`,
      headers: participantHeaders(rawSessionToken),
      payload: { category: "general", rating: 4, comment: "Duplicate detection caught a real workflow gap." },
    });
    expect(res.statusCode).toBe(201);
  });

  it("step 10: extends the pilot", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilotId}/extend`,
      headers: adminHeaders(),
      payload: { additionalDays: 5, reason: "Prospect wants to test month-end deadline tracking" },
    });
    expect(res.statusCode).toBe(200);
    const pilot = await prisma.pilotProgram.findUniqueOrThrow({ where: { id: pilotId } });
    expect(pilot.status).toBe("extended");
  });

  it("step 11: revokes access", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilotId}/revoke`,
      headers: adminHeaders(),
      payload: { reason: "Demonstration scenario complete; revoking before export/destroy" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("step 12: verifies the previous session can no longer enter", async () => {
    const res = await app.inject({ method: "GET", url: "/participant/session", headers: participantHeaders(rawSessionToken) });
    expect(res.statusCode).toBe(401);
  });

  it("step 13: exports the pilot receipt", async () => {
    const res = await app.inject({ method: "POST", url: `/pilots/${pilotId}/export`, headers: adminHeaders(), payload: {} });
    expect(res.statusCode).toBe(201);
    expect(res.json().checksumDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("step 14: destroys the demonstration environment", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/pilots/${pilotId}/destroy`,
      headers: adminHeaders(),
      payload: { reason: "Demonstration scenario complete" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().receiptDigest).toMatch(/^[0-9a-f]{64}$/);

    const pilot = await prisma.pilotProgram.findUniqueOrThrow({ where: { id: pilotId } });
    expect(pilot.status).toBe("destroyed");
  });
});
