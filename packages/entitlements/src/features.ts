import type { PrismaClient } from "@venture-pilot/db";
import { FeatureNotEntitledError } from "@venture-pilot/shared";

/**
 * Feature entitlement is pilot-scoped and role-independent: a feature that
 * isn't enabled for a pilot is inaccessible to every participant on that
 * pilot regardless of role. (Role-based *action* restrictions are a
 * separate concern — see roles.ts.)
 */
export async function listEnabledFeatureKeys(prisma: PrismaClient, pilotProgramId: string): Promise<string[]> {
  const entitlements = await prisma.pilotEntitlement.findMany({
    where: { pilotProgramId, enabled: true },
    include: { productFeature: true },
  });
  return entitlements.map((e) => e.productFeature.key);
}

export async function isFeatureEnabled(
  prisma: PrismaClient,
  pilotProgramId: string,
  featureKey: string,
): Promise<boolean> {
  const enabled = await listEnabledFeatureKeys(prisma, pilotProgramId);
  return enabled.includes(featureKey);
}

export async function assertFeatureEntitled(
  prisma: PrismaClient,
  pilotProgramId: string,
  featureKey: string,
): Promise<void> {
  if (!(await isFeatureEnabled(prisma, pilotProgramId, featureKey))) {
    throw new FeatureNotEntitledError(featureKey);
  }
}
