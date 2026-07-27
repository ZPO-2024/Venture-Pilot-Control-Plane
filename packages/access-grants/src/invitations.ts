import type { Prisma, PrismaClient } from "@venture-pilot/db";
import {
  actorToJson,
  type Actor,
  type Clock,
  systemClock,
  InvitationExpiredError,
  InvitationAlreadyRedeemedError,
  InvitationInvalidError,
  PilotAccessDeniedError,
  NotFoundError,
  transitionPilot,
} from "@venture-pilot/shared";
import { generateRawToken, hashToken } from "./crypto.js";

export interface CreateInvitationArgs {
  pilotProgramId: string;
  participantId: string;
  expiresInHours: number;
  actor: Actor;
  sourceRoute: string;
  clock?: Clock;
}

export async function createInvitation(
  tx: Prisma.TransactionClient,
  args: CreateInvitationArgs,
) {
  const participant = await tx.pilotParticipant.findUnique({ where: { id: args.participantId } });
  if (!participant || participant.pilotProgramId !== args.pilotProgramId) {
    throw new NotFoundError("PilotParticipant", args.participantId);
  }

  const clock = args.clock ?? systemClock;
  const rawToken = generateRawToken();
  const expiresAt = new Date(clock.now().getTime() + args.expiresInHours * 60 * 60 * 1000);

  const invitation = await tx.invitation.create({
    data: {
      pilotProgramId: args.pilotProgramId,
      participantId: args.participantId,
      roleAtIssuance: participant.role,
      tokenHash: hashToken(rawToken),
      expiresAt,
      createdByActor: args.actor.id,
    },
  });

  await tx.pilotParticipant.update({
    where: { id: args.participantId },
    data: { invitedAt: clock.now() },
  });

  // Deliberately no token/tokenHash in the audit payload — only identifiers.
  await tx.auditEvent.create({
    data: {
      pilotProgramId: args.pilotProgramId,
      actorJson: actorToJson(args.actor) as Prisma.InputJsonValue,
      action: "invitation.issued",
      newStateJson: { invitationId: invitation.id, participantId: args.participantId, expiresAt } as Prisma.InputJsonValue,
      reason: "Admin issued a participant invitation",
      sourceRoute: args.sourceRoute,
      authorityClassification: "admin_action",
    },
  });

  return { invitation, rawToken };
}

export interface RedeemInvitationArgs {
  rawToken: string;
  displayName?: string;
  userAgent?: string;
  ipHash?: string;
  sourceRoute: string;
  clock?: Clock;
}

export interface RedeemInvitationResult {
  rawSessionToken: string;
  sessionId: string;
  sessionExpiresAt: Date;
  accessGrantId: string;
  participantId: string;
  pilotProgramId: string;
}

// Redemption is single-use by construction: the claiming updateMany below
// only succeeds for a row still in `pending` status, so a concurrent or
// repeat redemption attempt sees 0 rows affected and fails closed.
export async function redeemInvitation(
  prisma: PrismaClient,
  args: RedeemInvitationArgs,
): Promise<RedeemInvitationResult> {
  const clock = args.clock ?? systemClock;
  const tokenHash = hashToken(args.rawToken);

  return prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({ where: { tokenHash } });
    if (!invitation) {
      throw new InvitationInvalidError();
    }

    const now = clock.now();

    if (invitation.status === "revoked") {
      throw new InvitationInvalidError("Invitation has been revoked");
    }
    if (invitation.status === "redeemed") {
      throw new InvitationAlreadyRedeemedError();
    }
    if (invitation.expiresAt.getTime() <= now.getTime()) {
      throw new InvitationExpiredError();
    }

    const claim = await tx.invitation.updateMany({
      where: { id: invitation.id, status: "pending", expiresAt: { gt: now } },
      data: { status: "redeemed", redeemedAt: now },
    });
    if (claim.count === 0) {
      // Lost a race against a concurrent redemption, or expired between the
      // read above and this write — fail closed either way.
      const fresh = await tx.invitation.findUnique({ where: { id: invitation.id } });
      if (fresh?.status === "redeemed") throw new InvitationAlreadyRedeemedError();
      throw new InvitationExpiredError();
    }

    const pilotProgram = await tx.pilotProgram.findUniqueOrThrow({ where: { id: invitation.pilotProgramId } });
    const environment = await tx.pilotEnvironment.findUnique({ where: { pilotProgramId: pilotProgram.id } });
    if (!environment) {
      throw new PilotAccessDeniedError("Pilot environment is not provisioned yet");
    }

    if (pilotProgram.status === "invited") {
      await transitionPilot(tx, {
        pilotProgramId: pilotProgram.id,
        toState: "active",
        actor: { type: "participant", id: invitation.participantId },
        reason: "First participant redeemed an invitation",
        sourceRoute: args.sourceRoute,
        authorityClassification: "participant_action",
      });
    } else if (!["active", "extended", "extension_pending"].includes(pilotProgram.status)) {
      throw new PilotAccessDeniedError(`Pilot is not accepting redemptions (status: ${pilotProgram.status})`);
    }

    const grantExpiresAt = pilotProgram.expiresAt ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const grant = await tx.accessGrant.create({
      data: {
        pilotProgramId: pilotProgram.id,
        participantId: invitation.participantId,
        productId: pilotProgram.productId,
        productVersionId: pilotProgram.productVersionId,
        environmentId: environment.id,
        role: invitation.roleAtIssuance,
        expiresAt: grantExpiresAt,
      },
    });

    const rawSessionToken = generateRawToken();
    const session = await tx.session.create({
      data: {
        participantId: invitation.participantId,
        accessGrantId: grant.id,
        tokenHash: hashToken(rawSessionToken),
        expiresAt: grantExpiresAt,
        userAgent: args.userAgent,
        ipHash: args.ipHash,
      },
    });

    await tx.pilotParticipant.update({
      where: { id: invitation.participantId },
      data: {
        status: "active",
        displayName: args.displayName ?? undefined,
      },
    });

    await tx.auditEvent.create({
      data: {
        pilotProgramId: pilotProgram.id,
        actorJson: actorToJson({ type: "participant", id: invitation.participantId }) as Prisma.InputJsonValue,
        action: "invitation.redeemed",
        newStateJson: { invitationId: invitation.id, accessGrantId: grant.id, sessionId: session.id } as Prisma.InputJsonValue,
        reason: "Invitation redeemed by participant",
        relatedProductId: pilotProgram.productId,
        relatedGrantIds: [grant.id],
        sourceRoute: args.sourceRoute,
        authorityClassification: "participant_action",
      },
    });

    return {
      rawSessionToken,
      sessionId: session.id,
      sessionExpiresAt: session.expiresAt,
      accessGrantId: grant.id,
      participantId: invitation.participantId,
      pilotProgramId: pilotProgram.id,
    };
  });
}
