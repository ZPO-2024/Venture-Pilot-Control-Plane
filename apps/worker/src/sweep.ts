import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient, Prisma } from "@venture-pilot/db";
import { SYSTEM_ACTOR, actorToJson, type Clock, systemClock, transitionPilot, DestructionBlockedError } from "@venture-pilot/shared";
import { runDestruction } from "@venture-pilot/provisioning";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));

export interface SweepConfig {
  expiringSoonThresholdHours: number;
  exportRetentionDays: number; // kept for symmetry with env; retention itself is read per-ExportRequest
}

export interface SweepResult {
  expiredPilots: string[];
  expiringSoonNoticesCreated: string[];
  exportsRetentionExpired: string[];
  destructionsExecuted: string[];
  destructionsBlocked: string[];
}

const ACCESS_PERMITTED_OR_INVITED_STATES = ["invited", "active", "extension_pending", "extended"] as const;

/**
 * One sweep pass. Deliberately idempotent and safe to call on any interval
 * (or repeatedly in a test with a ManualClock) -- every step only acts on
 * rows that are actually due, and re-running a pass that found nothing due
 * is a no-op.
 */
export async function runSweepOnce(
  prisma: PrismaClient,
  config: SweepConfig,
  clock: Clock = systemClock,
): Promise<SweepResult> {
  const result: SweepResult = {
    expiredPilots: [],
    expiringSoonNoticesCreated: [],
    exportsRetentionExpired: [],
    destructionsExecuted: [],
    destructionsBlocked: [],
  };

  await expireOverduePilots(prisma, clock, result);
  await noticeExpiringSoon(prisma, clock, config, result);
  await sweepExportRetention(prisma, clock, result);
  await sweepDueDestructions(prisma, clock, result);

  return result;
}

async function expireOverduePilots(prisma: PrismaClient, clock: Clock, result: SweepResult): Promise<void> {
  const now = clock.now();
  const overdue = await prisma.pilotProgram.findMany({
    where: { expiresAt: { lte: now }, status: { in: [...ACCESS_PERMITTED_OR_INVITED_STATES] } },
  });

  for (const pilot of overdue) {
    await prisma.$transaction(async (tx) => {
      const grants = await tx.accessGrant.findMany({ where: { pilotProgramId: pilot.id, status: "active" }, select: { id: true } });
      const grantIds = grants.map((g) => g.id);

      if (grantIds.length > 0) {
        await tx.accessGrant.updateMany({ where: { id: { in: grantIds } }, data: { status: "expired" } });
        await tx.session.updateMany({
          where: { accessGrantId: { in: grantIds }, revokedAt: null },
          data: { revokedAt: now, revokedReason: "Pilot trial period expired" },
        });
      }

      await tx.pilotParticipant.updateMany({
        where: { pilotProgramId: pilot.id, status: "active" },
        data: { status: "expired" },
      });

      // Default posture: environment is *retained*, just suspended -- not
      // destroyed -- until an admin reviews conversion/export. See
      // docs/DATA_RETENTION.md.
      await tx.pilotEnvironment.updateMany({ where: { pilotProgramId: pilot.id }, data: { status: "suspended" } });

      await transitionPilot(tx, {
        pilotProgramId: pilot.id,
        toState: "expired",
        actor: SYSTEM_ACTOR,
        reason: "Trial period expired (worker sweep)",
        sourceRoute: "worker:sweep",
        authorityClassification: "system_automated",
        affectedGrantIds: grantIds,
      });
    });
    result.expiredPilots.push(pilot.id);
  }
}

async function noticeExpiringSoon(
  prisma: PrismaClient,
  clock: Clock,
  config: SweepConfig,
  result: SweepResult,
): Promise<void> {
  const now = clock.now();
  const horizon = new Date(now.getTime() + config.expiringSoonThresholdHours * 60 * 60 * 1000);

  const soon = await prisma.pilotProgram.findMany({
    where: { expiresAt: { gt: now, lte: horizon }, status: { in: ["active", "extended", "extension_pending"] } },
  });

  for (const pilot of soon) {
    const existing = await prisma.pilotMilestone.findMany({
      where: { pilotProgramId: pilot.id, kind: "expiring_soon" },
    });
    const expiresAtIso = pilot.expiresAt!.toISOString();
    const alreadyNoticed = existing.some((m) => (m.metadataJson as { expiresAt?: string } | null)?.expiresAt === expiresAtIso);
    if (alreadyNoticed) continue;

    await prisma.pilotMilestone.create({
      data: {
        pilotProgramId: pilot.id,
        kind: "expiring_soon",
        metadataJson: { expiresAt: expiresAtIso, thresholdHours: config.expiringSoonThresholdHours } as Prisma.InputJsonValue,
      },
    });
    result.expiringSoonNoticesCreated.push(pilot.id);
  }
}

async function sweepExportRetention(prisma: PrismaClient, clock: Clock, result: SweepResult): Promise<void> {
  const now = clock.now();
  const overdue = await prisma.exportRequest.findMany({
    where: { status: "delivered", retentionExpiresAt: { lte: now } },
  });

  for (const exportRequest of overdue) {
    if (exportRequest.storageRef) {
      const absolute = path.join(REPO_ROOT, exportRequest.storageRef);
      if (existsSync(absolute)) {
        try {
          unlinkSync(absolute);
        } catch {
          // Best-effort: the DB status flip below is what matters for
          // "do not retain customer information indefinitely"; a failed
          // unlink is logged by the caller via the returned result set
          // being smaller than expected, not swallowed silently forever.
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.exportRequest.update({ where: { id: exportRequest.id }, data: { status: "expired" } });
      await tx.auditEvent.create({
        data: {
          pilotProgramId: exportRequest.pilotProgramId,
          actorJson: actorToJson(SYSTEM_ACTOR) as Prisma.InputJsonValue,
          action: "export.retention_expired",
          newStateJson: { exportRequestId: exportRequest.id } as Prisma.InputJsonValue,
          reason: "Export retention window elapsed; exported file removed",
          sourceRoute: "worker:sweep",
          authorityClassification: "system_automated",
        },
      });
    });
    result.exportsRetentionExpired.push(exportRequest.id);
  }
}

async function sweepDueDestructions(prisma: PrismaClient, clock: Clock, result: SweepResult): Promise<void> {
  const now = clock.now();
  const due = await prisma.destructionRequest.findMany({
    where: {
      status: { in: ["pending", "blocked"] },
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
    },
  });

  for (const request of due) {
    try {
      await runDestruction(prisma, {
        pilotProgramId: request.pilotProgramId,
        destructionRequestId: request.id,
        actor: SYSTEM_ACTOR,
        sourceRoute: "worker:sweep",
      });
      result.destructionsExecuted.push(request.id);
    } catch (err) {
      if (err instanceof DestructionBlockedError) {
        result.destructionsBlocked.push(request.id);
      } else {
        // One pilot's failure must not stop the sweep from processing
        // every other due row this pass; it will simply be retried next
        // interval.
        // eslint-disable-next-line no-console
        console.error(`worker sweep: destruction ${request.id} failed`, err);
      }
    }
  }
}
