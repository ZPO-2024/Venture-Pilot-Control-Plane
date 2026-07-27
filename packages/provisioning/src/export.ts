import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient, Prisma } from "@venture-pilot/db";
import { type Actor, actorToJson } from "@venture-pilot/shared";
import { getAdapter } from "@venture-pilot/product-adapters";
import type { AdapterContext, AdapterState } from "@venture-pilot/product-adapters";
import { verifyTenantChain } from "./tenant.js";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const EXPORTS_ROOT = path.join(REPO_ROOT, "deployment", "exports");

export interface RunExportArgs {
  pilotProgramId: string;
  exportRequestId: string;
  actor: Actor;
  sourceRoute: string;
  retentionDays?: number;
}

/**
 * Builds a self-contained export bundle: the adapter's product-owned data
 * plus the control-plane's own record of the pilot (participants, grants,
 * usage, feedback, audit trail, conversion record if any). Written to
 * deployment/exports/ (gitignored) and referenced by ExportRequest.
 */
export async function runExport(prisma: PrismaClient, args: RunExportArgs) {
  const chain = await verifyTenantChain(prisma, args.pilotProgramId);
  const environment = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { id: chain.environmentId } });
  const adapter = getAdapter(chain.adapterKey);

  const ctx: AdapterContext = {
    pilotProgramId: chain.pilotProgramId,
    pilotOrgId: chain.pilotOrgId,
    environmentId: chain.environmentId,
    idempotencyKey: `export:${args.exportRequestId}`,
    actor: args.actor,
  };
  const state: AdapterState = (environment.adapterState as AdapterState) ?? {};
  const adapterExport = await adapter.exportPilotData(ctx, state);

  const [pilotProgram, participants, grants, usageEvents, feedback, auditEvents, conversionRecord] = await Promise.all([
    prisma.pilotProgram.findUniqueOrThrow({ where: { id: args.pilotProgramId }, include: { pilotOrg: true } }),
    prisma.pilotParticipant.findMany({ where: { pilotProgramId: args.pilotProgramId } }),
    prisma.accessGrant.findMany({ where: { pilotProgramId: args.pilotProgramId } }),
    prisma.usageEvent.findMany({ where: { pilotProgramId: args.pilotProgramId } }),
    prisma.feedbackRecord.findMany({ where: { pilotProgramId: args.pilotProgramId } }),
    prisma.auditEvent.findMany({ where: { pilotProgramId: args.pilotProgramId }, orderBy: { occurredAt: "asc" } }),
    prisma.conversionRecord.findUnique({ where: { pilotProgramId: args.pilotProgramId } }),
  ]);

  const bundle = {
    exportedAt: new Date().toISOString(),
    pilotProgram: {
      id: pilotProgram.id,
      name: pilotProgram.name,
      status: pilotProgram.status,
      organization: pilotProgram.pilotOrg.name,
      startAt: pilotProgram.startAt,
      expiresAt: pilotProgram.expiresAt,
    },
    participants: participants.map((p) => ({ id: p.id, email: p.email, role: p.role, status: p.status })),
    accessGrants: grants.map((g) => ({ id: g.id, participantId: g.participantId, role: g.role, status: g.status })),
    usageEvents: usageEvents.map((e) => ({ type: e.type, occurredAt: e.occurredAt, metadata: e.metadataJson })),
    feedback: feedback.map((f) => ({ category: f.category, rating: f.rating, comment: f.comment, subject: f.subject })),
    auditTrail: auditEvents.map((a) => ({
      action: a.action,
      actor: a.actorJson,
      reason: a.reason,
      occurredAt: a.occurredAt,
    })),
    conversionRecord: conversionRecord ?? null,
    productData: adapterExport.files,
  };

  const bundleJson = JSON.stringify(bundle, null, 2);
  const checksumDigest = createHash("sha256").update(bundleJson).digest("hex");

  const dir = path.join(EXPORTS_ROOT, args.pilotProgramId);
  mkdirSync(dir, { recursive: true });
  const storageRef = path.join("deployment", "exports", args.pilotProgramId, `${args.exportRequestId}.json`);
  writeFileSync(path.join(REPO_ROOT, storageRef), bundleJson, "utf8");

  const retentionDays = args.retentionDays ?? 14;
  const now = new Date();
  const retentionExpiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.exportRequest.update({
      where: { id: args.exportRequestId },
      data: {
        status: "delivered",
        deliveredAt: now,
        storageRef,
        checksumDigest,
        retentionExpiresAt,
      },
    });
    await tx.auditEvent.create({
      data: {
        pilotProgramId: args.pilotProgramId,
        actorJson: actorToJson(args.actor) as Prisma.InputJsonValue,
        action: "export.completed",
        newStateJson: { exportRequestId: args.exportRequestId, checksumDigest } as Prisma.InputJsonValue,
        reason: "Pilot data export completed",
        relatedProductId: chain.productId,
        sourceRoute: args.sourceRoute,
        authorityClassification: args.actor.type === "admin" ? "admin_action" : "participant_action",
      },
    });
  });

  return { storageRef, checksumDigest, retentionExpiresAt };
}
