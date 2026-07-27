import type { PrismaClient, ProvisioningRunKind, Prisma } from "@venture-pilot/db";
import {
  type Actor,
  actorToJson,
  DatasetVersionMismatchError,
  ProvisioningError,
  transitionPilot,
} from "@venture-pilot/shared";
import { digestOfFixture, readFixtureJson } from "@venture-pilot/shared";
import { getAdapter } from "@venture-pilot/product-adapters";
import type { AdapterContext, AdapterState } from "@venture-pilot/product-adapters";
import { verifyTenantChain } from "./tenant.js";

export interface RunProvisioningArgs {
  pilotProgramId: string;
  actor: Actor;
  sourceRoute: string;
  idempotencyKey: string;
  reason?: string;
}

export interface RunProvisioningResult {
  cached: boolean;
  recordCounts: Record<string, number>;
  datasetVersionId: string;
}

async function runProvisioningOperation(
  prisma: PrismaClient,
  kind: ProvisioningRunKind,
  args: RunProvisioningArgs,
): Promise<RunProvisioningResult> {
  const existing = await prisma.provisioningRun.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
  if (existing?.status === "succeeded") {
    const cached = existing.resultJson as { recordCounts: Record<string, number>; datasetVersionId: string };
    // `cached: true` last and explicit -- never let a spread silently win.
    return { ...cached, cached: true };
  }

  const chain = await verifyTenantChain(prisma, args.pilotProgramId);
  const [environment, pilotProgram] = await Promise.all([
    prisma.pilotEnvironment.findUniqueOrThrow({
      where: { pilotProgramId: args.pilotProgramId },
      include: { environmentType: true },
    }),
    prisma.pilotProgram.findUniqueOrThrow({ where: { id: args.pilotProgramId } }),
  ]);

  const run =
    existing ??
    (await prisma.provisioningRun.create({
      data: {
        pilotProgramId: args.pilotProgramId,
        pilotEnvironmentId: environment.id,
        kind,
        status: "pending",
        idempotencyKey: args.idempotencyKey,
        triggeredByActor: args.actor.id,
      },
    }));

  await prisma.provisioningRun.update({ where: { id: run.id }, data: { status: "running" } });

  try {
    const adapter = getAdapter(chain.adapterKey);
    const ctx: AdapterContext = {
      pilotProgramId: chain.pilotProgramId,
      pilotOrgId: chain.pilotOrgId,
      environmentId: chain.environmentId,
      idempotencyKey: args.idempotencyKey,
      actor: args.actor,
    };

    const availability = await adapter.verifyAvailability(ctx);
    if (!availability.available) {
      throw new ProvisioningError(availability.detail ?? "Adapter reported unavailable");
    }

    let state: AdapterState = (environment.adapterState as AdapterState) ?? {};

    if (kind === "initial_provision") {
      const provisioned = await adapter.provisionEnvironment(ctx, state, {
        environmentTypeKey: environment.environmentType.key,
      });
      state = provisioned.state;
    } else {
      const reset = await adapter.resetEnvironment(ctx, state);
      state = reset.state;
    }

    const dataset = await prisma.demoDataset.findFirst({
      where: { productId: chain.productId },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const datasetVersion = dataset?.versions[0];
    if (!datasetVersion) {
      throw new ProvisioningError(`No dataset version registered for product ${chain.productId}`);
    }

    const liveDigest = digestOfFixture(datasetVersion.storageRef);
    if (liveDigest !== datasetVersion.digest) {
      throw new DatasetVersionMismatchError(
        `DatasetVersion ${datasetVersion.id} digest ${datasetVersion.digest} does not match current fixture content (${liveDigest})`,
      );
    }

    const recordsJson = readFixtureJson(datasetVersion.storageRef);
    const loaded = await adapter.loadDataset(ctx, state, {
      datasetVersionId: datasetVersion.id,
      storageRef: datasetVersion.storageRef,
      digest: datasetVersion.digest,
      recordsJson,
    });
    state = loaded.state;

    const entitlements = await prisma.pilotEntitlement.findMany({
      where: { pilotProgramId: args.pilotProgramId, enabled: true },
      include: { productFeature: true },
    });
    const featureKeys = entitlements.map((e) => e.productFeature.key);
    const applied = await adapter.applyEntitlements(ctx, state, { featureKeys });
    state = applied.state;

    // Stored without `cached` -- that field is call-site metadata about
    // *this* invocation, not a fact about the run itself, and including it
    // here would let a stored `cached: false` clobber the `cached: true`
    // a later cache-hit read needs to report.
    const persistedResult = { recordCounts: loaded.data.recordCounts, datasetVersionId: datasetVersion.id };
    const result: RunProvisioningResult = { cached: false, ...persistedResult };

    await prisma.$transaction(async (tx) => {
      await tx.pilotEnvironment.update({
        where: { id: environment.id },
        data: { status: "ready", adapterState: state as Prisma.InputJsonValue, currentDatasetVersionId: datasetVersion.id },
      });
      await tx.provisioningRun.update({
        where: { id: run.id },
        data: { status: "succeeded", finishedAt: new Date(), resultJson: persistedResult as unknown as Prisma.InputJsonValue },
      });

      if (kind === "initial_provision" && pilotProgram.status === "provisioning") {
        await transitionPilot(tx, {
          pilotProgramId: args.pilotProgramId,
          toState: "ready",
          actor: args.actor,
          reason: args.reason ?? "Initial provisioning succeeded",
          sourceRoute: args.sourceRoute,
          authorityClassification: args.actor.type === "admin" ? "admin_action" : "system_automated",
        });
      } else {
        await tx.auditEvent.create({
          data: {
            pilotProgramId: args.pilotProgramId,
            actorJson: actorToJson(args.actor) as Prisma.InputJsonValue,
            action: "environment.reset",
            newStateJson: result as unknown as Prisma.InputJsonValue,
            reason: args.reason ?? "Environment reset",
            relatedProductId: chain.productId,
            sourceRoute: args.sourceRoute,
            authorityClassification: args.actor.type === "admin" ? "admin_action" : "system_automated",
          },
        });
      }
    });

    return result;
  } catch (err) {
    await prisma.$transaction(async (tx) => {
      await tx.provisioningRun.update({
        where: { id: run.id },
        data: { status: "failed", finishedAt: new Date(), errorMessage: err instanceof Error ? err.message : String(err) },
      });
      if (kind === "initial_provision" && pilotProgram.status === "provisioning") {
        await transitionPilot(tx, {
          pilotProgramId: args.pilotProgramId,
          toState: "failed_provisioning",
          actor: args.actor,
          reason: err instanceof Error ? err.message : "Provisioning failed",
          sourceRoute: args.sourceRoute,
          authorityClassification: "system_automated",
        });
      }
    });
    throw err;
  }
}

export function runInitialProvisioning(prisma: PrismaClient, args: RunProvisioningArgs) {
  return runProvisioningOperation(prisma, "initial_provision", args);
}

export function runReset(prisma: PrismaClient, args: RunProvisioningArgs) {
  return runProvisioningOperation(prisma, "reset", args);
}
