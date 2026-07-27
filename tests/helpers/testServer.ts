import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { buildServer } from "../../apps/api/src/server.js";
import { loadEnv } from "../../apps/api/src/env.js";

export function createTestApp(overrides: Partial<ReturnType<typeof loadEnv>> = {}): FastifyInstance {
  return buildServer({ env: { ...loadEnv(), ...overrides } });
}

export function adminHeaders(extra: Record<string, string> = {}) {
  return { authorization: `Bearer ${loadEnv().ADMIN_API_TOKEN}`, "content-type": "application/json", ...extra };
}

export function participantHeaders(rawSessionToken: string, extra: Record<string, string> = {}) {
  return { authorization: `Bearer ${rawSessionToken}`, "content-type": "application/json", ...extra };
}

/** Deletes all pilot-scoped rows between tests, but leaves the seeded product catalog intact. */
export async function resetPilotData(): Promise<void> {
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.usageEvent.deleteMany(),
    prisma.healthEvent.deleteMany(),
    prisma.feedbackRecord.deleteMany(),
    prisma.conversionRecord.deleteMany(),
    prisma.exportRequest.deleteMany(),
    prisma.destructionRequest.deleteMany(),
    prisma.provisioningRun.deleteMany(),
    prisma.session.deleteMany(),
    prisma.accessGrant.deleteMany(),
    prisma.invitation.deleteMany(),
    prisma.pilotEntitlement.deleteMany(),
    prisma.pilotMilestone.deleteMany(),
    prisma.pilotParticipant.deleteMany(),
    prisma.pilotEnvironment.deleteMany(),
    prisma.pilotProgram.deleteMany(),
    prisma.pilotOrganization.deleteMany(),
  ]);
}

export interface CreatedPilot {
  pilotId: string;
  participantId: string;
  participantRole: string;
  productKey: string;
}

export interface CreatePilotFixtureOptions {
  productKey?: string;
  productVersion?: string;
  environmentTypeKey?: string;
  featureKeys?: string[];
  participantRole?: "primary_contact" | "evaluator" | "observer";
  provision?: boolean;
}

/** Creates (and by default provisions) a pilot with one participant, ready for invitation/redemption tests. */
export async function createPilotFixture(
  app: FastifyInstance,
  opts: CreatePilotFixtureOptions = {},
): Promise<CreatedPilot> {
  const productKey = opts.productKey ?? "forgeflow";
  const res = await app.inject({
    method: "POST",
    url: "/pilots",
    headers: adminHeaders(),
    payload: {
      productKey,
      productVersion: opts.productVersion ?? "0.1.0-demo",
      templateKey: "test-template",
      organization: { name: "Test Org", primaryContactEmail: "prospect@example.com" },
      name: "Test Pilot",
      environmentTypeKey: opts.environmentTypeKey ?? "sandbox",
      featureKeys: opts.featureKeys ?? [],
      participants: [{ email: "participant@example.com", role: opts.participantRole ?? "evaluator" }],
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`createPilotFixture: POST /pilots failed (${res.statusCode}): ${res.body}`);
  }
  const pilot = res.json();

  if (opts.provision !== false) {
    const provisionRes = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.id}/provision`,
      headers: adminHeaders(),
      payload: {},
    });
    if (provisionRes.statusCode !== 200) {
      throw new Error(`createPilotFixture: provision failed (${provisionRes.statusCode}): ${provisionRes.body}`);
    }
  }

  return {
    pilotId: pilot.id,
    participantId: pilot.participants[0].id,
    participantRole: pilot.participants[0].role,
    productKey,
  };
}

export async function issueAndRedeemInvitation(
  app: FastifyInstance,
  pilotId: string,
  participantId: string,
  opts: { expiresInHours?: number; remoteAddress?: string } = {},
): Promise<{ rawSessionToken: string; rawInvitationToken: string; invitationId: string }> {
  const inviteRes = await app.inject({
    method: "POST",
    url: `/pilots/${pilotId}/invitations`,
    headers: adminHeaders(),
    payload: { participantId, expiresInHours: opts.expiresInHours ?? 168 },
  });
  if (inviteRes.statusCode !== 201) {
    throw new Error(`issueAndRedeemInvitation: invite failed (${inviteRes.statusCode}): ${inviteRes.body}`);
  }
  const invite = inviteRes.json();

  const redeemRes = await app.inject({
    method: "POST",
    url: `/invitations/${invite.rawToken}/redeem`,
    headers: { "content-type": "application/json" },
    payload: {},
    ...(opts.remoteAddress ? { remoteAddress: opts.remoteAddress } : {}),
  });
  if (redeemRes.statusCode !== 201) {
    throw new Error(`issueAndRedeemInvitation: redeem failed (${redeemRes.statusCode}): ${redeemRes.body}`);
  }
  const redeemed = redeemRes.json();

  return { rawSessionToken: redeemed.rawSessionToken, rawInvitationToken: invite.rawToken, invitationId: invite.invitationId };
}
