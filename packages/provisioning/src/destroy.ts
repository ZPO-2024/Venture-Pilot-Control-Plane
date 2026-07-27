import { createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "@venture-pilot/db";
import { type Actor, DestructionBlockedError, transitionPilot } from "@venture-pilot/shared";
import { getAdapter } from "@venture-pilot/product-adapters";
import type { AdapterContext, AdapterState } from "@venture-pilot/product-adapters";
import { verifyTenantChain } from "./tenant.js";

export interface RunDestructionArgs {
  pilotProgramId: string;
  destructionRequestId: string;
  actor: Actor;
  sourceRoute: string;
}

/**
 * Never runs automatically ahead of an approved-but-undelivered export or a
 * pending one — those block destruction outright, preserving evidence
 * needed for audit or a promised export (see docs/DATA_RETENTION.md).
 */
export async function runDestruction(prisma: PrismaClient, args: RunDestructionArgs) {
  const chain = await verifyTenantChain(prisma, args.pilotProgramId);

  const blockingExport = await prisma.exportRequest.findFirst({
    where: { pilotProgramId: args.pilotProgramId, status: { in: ["pending", "ready"] } },
  });
  if (blockingExport) {
    await prisma.destructionRequest.update({
      where: { id: args.destructionRequestId },
      data: { status: "blocked", blockingReason: `Undelivered export request ${blockingExport.id}` },
    });
    throw new DestructionBlockedError(`export request ${blockingExport.id} has not been delivered yet`);
  }

  const environment = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { id: chain.environmentId } });
  const adapter = getAdapter(chain.adapterKey);

  const ctx: AdapterContext = {
    pilotProgramId: chain.pilotProgramId,
    pilotOrgId: chain.pilotOrgId,
    environmentId: chain.environmentId,
    idempotencyKey: `destroy:${args.destructionRequestId}`,
    actor: args.actor,
  };
  const state: AdapterState = (environment.adapterState as AdapterState) ?? {};
  const destroyed = await adapter.destroyEnvironment(ctx, state);

  const receiptJson = destroyed.data.receipt;
  const receiptDigest = createHash("sha256").update(JSON.stringify(receiptJson)).digest("hex");
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.pilotEnvironment.update({
      where: { id: environment.id },
      data: { status: "destroyed", adapterState: destroyed.state as Prisma.InputJsonValue },
    });
    await tx.destructionRequest.update({
      where: { id: args.destructionRequestId },
      data: {
        status: "executed",
        executedAt: now,
        receiptDigest,
        receiptJson: receiptJson as Prisma.InputJsonValue,
      },
    });
    await transitionPilot(tx, {
      pilotProgramId: args.pilotProgramId,
      toState: "destroyed",
      actor: args.actor,
      reason: "Destruction request executed",
      sourceRoute: args.sourceRoute,
      authorityClassification: args.actor.type === "admin" ? "admin_action" : "system_automated",
      extraStateJson: { receiptDigest },
    });
  });

  return { receiptDigest, receiptJson, executedAt: now };
}
