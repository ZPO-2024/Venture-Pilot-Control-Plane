import type { Prisma, PrismaClient } from "@venture-pilot/db";
import {
  type Actor,
  actorToJson,
  type Clock,
  systemClock,
  SessionInvalidError,
  PilotAccessDeniedError,
  isAccessPermitted,
} from "@venture-pilot/shared";
import { hashToken } from "./crypto.js";

export interface ValidatedSession {
  sessionId: string;
  participantId: string;
  participantRole: string;
  accessGrantId: string;
  pilotProgramId: string;
  productId: string;
  productVersionId: string;
  environmentId: string;
}

// Sessions are opaque, server-side, and re-validated in full against live
// Postgres state on every call — never a self-contained JWT claim. This is
// what structurally guarantees "expired pilot rejected even with a cached
// session": there is no client-held claim to trust, only a lookup key.
export async function validateSession(
  prisma: PrismaClient,
  rawToken: string,
  clock: Clock = systemClock,
): Promise<ValidatedSession> {
  const tokenHash = hashToken(rawToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { accessGrant: { include: { pilotProgram: true } } },
  });

  if (!session) throw new SessionInvalidError();
  if (session.revokedAt) throw new SessionInvalidError("Session has been revoked");

  const now = clock.now();
  if (session.expiresAt.getTime() <= now.getTime()) {
    throw new SessionInvalidError("Session has expired");
  }

  const grant = session.accessGrant;
  if (grant.status !== "active") {
    throw new SessionInvalidError("Access grant is no longer active");
  }
  if (grant.expiresAt.getTime() <= now.getTime()) {
    throw new SessionInvalidError("Access grant has expired");
  }

  const pilot = grant.pilotProgram;
  if (!isAccessPermitted(pilot.status)) {
    throw new PilotAccessDeniedError(`Pilot status '${pilot.status}' does not permit access`);
  }
  if (pilot.expiresAt && pilot.expiresAt.getTime() <= now.getTime()) {
    throw new PilotAccessDeniedError("Pilot has expired");
  }

  await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });

  return {
    sessionId: session.id,
    participantId: session.participantId,
    participantRole: grant.role,
    accessGrantId: grant.id,
    pilotProgramId: pilot.id,
    productId: grant.productId,
    productVersionId: grant.productVersionId,
    environmentId: grant.environmentId,
  };
}

export interface RevokeAllForPilotResult {
  revokedGrantIds: string[];
  revokedSessionCount: number;
}

// Bulk-invalidates every active grant and session for a pilot in one
// transaction step, so an admin revoke kills every outstanding session at
// once rather than requiring a per-session sweep.
export async function revokeAllForPilot(
  tx: Prisma.TransactionClient,
  pilotProgramId: string,
  reason: string,
  clock: Clock = systemClock,
): Promise<RevokeAllForPilotResult> {
  const now = clock.now();
  const grants = await tx.accessGrant.findMany({
    where: { pilotProgramId, status: "active" },
    select: { id: true },
  });
  const grantIds = grants.map((g) => g.id);

  if (grantIds.length === 0) {
    return { revokedGrantIds: [], revokedSessionCount: 0 };
  }

  await tx.accessGrant.updateMany({
    where: { id: { in: grantIds } },
    data: { status: "revoked", revokedAt: now, revokedReason: reason },
  });

  const sessionResult = await tx.session.updateMany({
    where: { accessGrantId: { in: grantIds }, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });

  return { revokedGrantIds: grantIds, revokedSessionCount: sessionResult.count };
}

export interface RevokeSingleGrantArgs {
  accessGrantId: string;
  pilotProgramId: string;
  reason: string;
  actor: Actor;
  sourceRoute: string;
  clock?: Clock;
}

export async function revokeAccessGrant(tx: Prisma.TransactionClient, args: RevokeSingleGrantArgs) {
  const clock = args.clock ?? systemClock;
  const now = clock.now();

  const grant = await tx.accessGrant.findUnique({ where: { id: args.accessGrantId } });
  if (!grant || grant.pilotProgramId !== args.pilotProgramId) {
    throw new SessionInvalidError("Access grant does not belong to this pilot");
  }

  await tx.accessGrant.update({
    where: { id: args.accessGrantId },
    data: { status: "revoked", revokedAt: now, revokedReason: args.reason },
  });
  await tx.session.updateMany({
    where: { accessGrantId: args.accessGrantId, revokedAt: null },
    data: { revokedAt: now, revokedReason: args.reason },
  });

  await tx.auditEvent.create({
    data: {
      pilotProgramId: args.pilotProgramId,
      actorJson: actorToJson(args.actor) as Prisma.InputJsonValue,
      action: "access_grant.revoked",
      newStateJson: { accessGrantId: args.accessGrantId } as Prisma.InputJsonValue,
      reason: args.reason,
      relatedGrantIds: [args.accessGrantId],
      sourceRoute: args.sourceRoute,
      authorityClassification: args.actor.type === "admin" ? "admin_action" : "system_automated",
    },
  });
}
