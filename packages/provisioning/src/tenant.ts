import type { PrismaClient } from "@venture-pilot/db";
import { AdapterTenantViolationError, NotFoundError } from "@venture-pilot/shared";
import type { AdapterContext } from "@venture-pilot/product-adapters";

export interface TenantChain {
  pilotProgramId: string;
  pilotOrgId: string;
  environmentId: string;
  productId: string;
  productVersionId: string;
  adapterKey: string;
}

/**
 * Re-derives and verifies the full pilot -> org -> environment chain from
 * live DB state. Every adapter invocation goes through this first — an
 * adapter must never be trusted to enforce its own tenant boundary, and a
 * caller-supplied AdapterContext is never used without this check. A
 * mismatched pilotProgramId/environmentId pair throws before any adapter
 * method runs, which is exactly what the required "cross-pilot adapter
 * attempt" security test exercises.
 */
export async function verifyTenantChain(prisma: PrismaClient, pilotProgramId: string): Promise<TenantChain> {
  const pilotProgram = await prisma.pilotProgram.findUnique({
    where: { id: pilotProgramId },
    include: { productVersion: true, environment: true },
  });
  if (!pilotProgram) {
    throw new NotFoundError("PilotProgram", pilotProgramId);
  }
  if (!pilotProgram.environment) {
    throw new AdapterTenantViolationError("Pilot has no provisioned environment yet");
  }
  if (pilotProgram.environment.pilotProgramId !== pilotProgramId) {
    // Structurally impossible via the 1:1 FK today, but kept as an
    // explicit assertion: if this ever becomes a many relation, the guard
    // must not silently pass.
    throw new AdapterTenantViolationError();
  }

  return {
    pilotProgramId: pilotProgram.id,
    pilotOrgId: pilotProgram.pilotOrgId,
    environmentId: pilotProgram.environment.id,
    productId: pilotProgram.productId,
    productVersionId: pilotProgram.productVersionId,
    adapterKey: pilotProgram.productVersion.adapterKey,
  };
}

/**
 * Explicit assertion used by callers that already hold an environmentId
 * from elsewhere (e.g. a caller-constructed AdapterContext) and must prove
 * it actually belongs to the claimed pilot before using it.
 */
export function assertEnvironmentBelongsToPilot(chain: TenantChain, ctx: Pick<AdapterContext, "environmentId" | "pilotProgramId" | "pilotOrgId">): void {
  if (ctx.pilotProgramId !== chain.pilotProgramId || ctx.environmentId !== chain.environmentId || ctx.pilotOrgId !== chain.pilotOrgId) {
    throw new AdapterTenantViolationError();
  }
}
