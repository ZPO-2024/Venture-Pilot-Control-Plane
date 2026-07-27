import type { PrismaClient, Prisma } from "@venture-pilot/db";
import { type Actor, NotFoundError } from "@venture-pilot/shared";
import { getAdapter } from "@venture-pilot/product-adapters";
import type { AdapterContext, AdapterState } from "@venture-pilot/product-adapters";
import { verifyTenantChain } from "./tenant.js";

export interface CreateParticipantProjectionArgs {
  pilotProgramId: string;
  participantId: string;
  actor: Actor;
}

export interface ParticipantProjection {
  projectionKey: string;
  visibleFeatureKeys: string[];
}

/**
 * Establishes (or idempotently re-establishes) a participant's projection
 * into the underlying product. Called right after invitation redemption —
 * deliberately outside the redemption transaction, since adapter calls are
 * treated as network operations even when mocked.
 */
export async function createParticipantProjection(
  prisma: PrismaClient,
  args: CreateParticipantProjectionArgs,
): Promise<ParticipantProjection> {
  const chain = await verifyTenantChain(prisma, args.pilotProgramId);

  const participant = await prisma.pilotParticipant.findUnique({ where: { id: args.participantId } });
  if (!participant || participant.pilotProgramId !== args.pilotProgramId) {
    throw new NotFoundError("PilotParticipant", args.participantId);
  }

  const environment = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { id: chain.environmentId } });
  const adapter = getAdapter(chain.adapterKey);
  const ctx: AdapterContext = {
    pilotProgramId: chain.pilotProgramId,
    pilotOrgId: chain.pilotOrgId,
    environmentId: chain.environmentId,
    idempotencyKey: `participant-projection:${args.participantId}`,
    actor: args.actor,
  };

  const state: AdapterState = (environment.adapterState as AdapterState) ?? {};
  const result = await adapter.createParticipantProjection(ctx, state, {
    participantId: args.participantId,
    role: participant.role,
    displayName: participant.displayName ?? undefined,
  });

  await prisma.pilotEnvironment.update({
    where: { id: environment.id },
    data: { adapterState: result.state as Prisma.InputJsonValue },
  });

  return result.data;
}
