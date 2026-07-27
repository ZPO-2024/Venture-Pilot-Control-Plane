import type { PrismaClient, Prisma } from "@venture-pilot/db";
import type { Actor } from "@venture-pilot/shared";
import { getAdapter } from "@venture-pilot/product-adapters";
import type { AdapterContext, AdapterState } from "@venture-pilot/product-adapters";
import { verifyTenantChain } from "./tenant.js";

export interface CheckHealthArgs {
  pilotProgramId: string;
  actor: Actor;
}

export async function checkHealth(prisma: PrismaClient, args: CheckHealthArgs) {
  const chain = await verifyTenantChain(prisma, args.pilotProgramId);
  const environment = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { id: chain.environmentId } });
  const adapter = getAdapter(chain.adapterKey);

  const ctx: AdapterContext = {
    pilotProgramId: chain.pilotProgramId,
    pilotOrgId: chain.pilotOrgId,
    environmentId: chain.environmentId,
    idempotencyKey: `health-check:${Date.now()}`,
    actor: args.actor,
  };

  const state: AdapterState = (environment.adapterState as AdapterState) ?? {};
  const report = await adapter.reportHealth(ctx, state);

  const healthCheck = await prisma.productHealthCheck.findFirst({
    where: { productVersionId: chain.productVersionId },
  });

  const event = await prisma.healthEvent.create({
    data: {
      pilotEnvironmentId: environment.id,
      productHealthCheckId: healthCheck?.id,
      status: report.status,
      detailJson: report.detail as Prisma.InputJsonValue,
    },
  });

  await prisma.pilotEnvironment.update({
    where: { id: environment.id },
    data: { lastHealthCheckAt: event.occurredAt },
  });

  return { status: report.status, detail: report.detail, occurredAt: event.occurredAt };
}
