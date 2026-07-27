import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma, type Prisma } from "@venture-pilot/db";
import {
  CreatePilotSchema,
  IssueInvitationSchema,
  ExtendPilotSchema,
  SuspendPilotSchema,
  RevokePilotSchema,
  ResetPilotSchema,
  ProvisionPilotSchema,
  CreateExportRequestSchema,
  CreateDestructionRequestSchema,
  NotFoundError,
  PilotControlPlaneError,
  actorToJson,
  transitionPilot,
} from "@venture-pilot/shared";
import { createInvitation, revokeAllForPilot } from "@venture-pilot/access-grants";
import { runInitialProvisioning, runReset, runExport, runDestruction, checkHealth } from "@venture-pilot/provisioning";
import { listFormattedAuditTrail } from "@venture-pilot/audit";
import { parseBody } from "../lib/validate.js";

async function loadPilotOr404(id: string) {
  const pilot = await prisma.pilotProgram.findUnique({ where: { id } });
  if (!pilot) throw new NotFoundError("PilotProgram", id);
  return pilot;
}

export function registerPilotsAdminRoutes(app: FastifyInstance): void {
  app.post("/pilots", async (request, reply) => {
    const body = parseBody(CreatePilotSchema, request.body);

    const product = await prisma.product.findUnique({ where: { key: body.productKey } });
    if (!product) throw new NotFoundError("Product", body.productKey);

    const productVersion = await prisma.productVersion.findUnique({
      where: { productId_version: { productId: product.id, version: body.productVersion } },
      include: { features: true },
    });
    if (!productVersion) throw new NotFoundError("ProductVersion", body.productVersion);

    const environmentType = await prisma.productEnvironmentType.findUnique({
      where: { productId_key: { productId: product.id, key: body.environmentTypeKey } },
    });
    if (!environmentType) throw new NotFoundError("ProductEnvironmentType", body.environmentTypeKey);

    const durationDays = body.durationDays ?? app.config.DEFAULT_TRIAL_DURATION_DAYS;
    const startAt = new Date();
    const expiresAt = new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const pilotOrg = await tx.pilotOrganization.create({ data: body.organization });

      const pilotProgram = await tx.pilotProgram.create({
        data: {
          pilotOrgId: pilotOrg.id,
          productId: product.id,
          productVersionId: productVersion.id,
          templateKey: body.templateKey,
          name: body.name,
          startAt,
          expiresAt,
          createdByActor: request.actor!.id,
        },
      });

      await tx.pilotEnvironment.create({
        data: {
          pilotProgramId: pilotProgram.id,
          environmentTypeId: environmentType.id,
        },
      });

      for (const participant of body.participants) {
        await tx.pilotParticipant.create({
          data: {
            pilotProgramId: pilotProgram.id,
            email: participant.email,
            displayName: participant.displayName,
            role: participant.role,
          },
        });
      }

      for (const feature of productVersion.features) {
        await tx.pilotEntitlement.create({
          data: {
            pilotProgramId: pilotProgram.id,
            productFeatureId: feature.id,
            enabled: feature.defaultEnabled || body.featureKeys.includes(feature.key),
            source: body.featureKeys.includes(feature.key) ? "admin_override" : "template_default",
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          pilotProgramId: pilotProgram.id,
          actorJson: actorToJson(request.actor!) as Prisma.InputJsonValue,
          action: "pilot.created",
          newStateJson: { name: pilotProgram.name, productId: product.id, expiresAt } as Prisma.InputJsonValue,
          reason: "Admin created a new pilot",
          relatedProductId: product.id,
          sourceRoute: "POST /pilots",
          authorityClassification: "admin_action",
        },
      });

      return pilotProgram;
    });

    const full = await prisma.pilotProgram.findUnique({
      where: { id: result.id },
      include: { pilotOrg: true, environment: true, participants: true, entitlements: { include: { productFeature: true } } },
    });
    reply.status(201).send(full);
  });

  app.get<{ Querystring: { status?: string } }>("/pilots", async (request) => {
    return prisma.pilotProgram.findMany({
      where: request.query.status ? { status: request.query.status as never } : undefined,
      include: { pilotOrg: true, product: true, productVersion: true, environment: true, participants: true },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get<{ Params: { id: string } }>("/pilots/:id", async (request) => {
    const pilot = await prisma.pilotProgram.findUnique({
      where: { id: request.params.id },
      include: {
        pilotOrg: true,
        product: true,
        productVersion: true,
        environment: { include: { environmentType: true, currentDatasetVersion: true, healthEvents: { orderBy: { occurredAt: "desc" }, take: 20 } } },
        participants: true,
        accessGrants: true,
        entitlements: { include: { productFeature: true } },
        provisioningRuns: { orderBy: { startedAt: "desc" } },
        exportRequests: { orderBy: { requestedAt: "desc" } },
        destructionRequests: { orderBy: { requestedAt: "desc" } },
        feedbackRecords: { orderBy: { createdAt: "desc" } },
        conversionRecord: true,
        milestones: { orderBy: { occurredAt: "desc" } },
      },
    });
    if (!pilot) throw new NotFoundError("PilotProgram", request.params.id);
    return pilot;
  });

  app.post<{ Params: { id: string } }>("/pilots/:id/provision", async (request, reply) => {
    const body = parseBody(ProvisionPilotSchema, request.body);
    const pilot = await loadPilotOr404(request.params.id);

    if (pilot.status === "draft" || pilot.status === "failed_provisioning") {
      await prisma.$transaction((tx) =>
        transitionPilot(tx, {
          pilotProgramId: pilot.id,
          toState: "provisioning",
          actor: request.actor!,
          reason: body.reason ?? "Admin initiated provisioning",
          sourceRoute: "POST /pilots/:id/provision",
          authorityClassification: "admin_action",
        }),
      );
    }

    const result = await runInitialProvisioning(prisma, {
      pilotProgramId: pilot.id,
      actor: request.actor!,
      sourceRoute: "POST /pilots/:id/provision",
      idempotencyKey: body.idempotencyKey ?? `provision:${pilot.id}`,
      reason: body.reason,
    });
    reply.send(result);
  });

  app.post<{ Params: { id: string } }>("/pilots/:id/invitations", async (request, reply) => {
    const body = parseBody(IssueInvitationSchema, request.body);
    const pilot = await loadPilotOr404(request.params.id);
    if (!["ready", "invited", "active", "extended", "extension_pending"].includes(pilot.status)) {
      throw new PilotControlPlaneError("pilot_not_invitable", `Pilot status '${pilot.status}' does not permit issuing invitations`, 409);
    }

    const { invitation, rawToken } = await prisma.$transaction((tx) =>
      createInvitation(tx, {
        pilotProgramId: pilot.id,
        participantId: body.participantId,
        expiresInHours: body.expiresInHours,
        actor: request.actor!,
        sourceRoute: "POST /pilots/:id/invitations",
      }),
    );

    if (pilot.status === "ready") {
      await prisma.$transaction((tx) =>
        transitionPilot(tx, {
          pilotProgramId: pilot.id,
          toState: "invited",
          actor: request.actor!,
          reason: "First invitation issued",
          sourceRoute: "POST /pilots/:id/invitations",
          authorityClassification: "admin_action",
        }),
      );
    }

    reply.status(201).send({ invitationId: invitation.id, rawToken, expiresAt: invitation.expiresAt });
  });

  app.post<{ Params: { id: string } }>("/pilots/:id/extend", async (request, reply) => {
    const body = parseBody(ExtendPilotSchema, request.body);
    const pilot = await loadPilotOr404(request.params.id);

    if (!["active", "extension_pending", "extended"].includes(pilot.status)) {
      throw new PilotControlPlaneError("pilot_not_extendable", `Pilot status '${pilot.status}' cannot be extended`, 409);
    }

    const base = pilot.expiresAt && pilot.expiresAt.getTime() > Date.now() ? pilot.expiresAt : new Date();
    const newExpiresAt = new Date(base.getTime() + body.additionalDays * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      const grants = await tx.accessGrant.findMany({ where: { pilotProgramId: pilot.id, status: "active" }, select: { id: true } });
      const grantIds = grants.map((g) => g.id);

      await tx.pilotProgram.update({ where: { id: pilot.id }, data: { expiresAt: newExpiresAt } });
      if (grantIds.length > 0) {
        await tx.accessGrant.updateMany({ where: { id: { in: grantIds } }, data: { expiresAt: newExpiresAt } });
        await tx.session.updateMany({ where: { accessGrantId: { in: grantIds }, revokedAt: null }, data: { expiresAt: newExpiresAt } });
      }

      if (pilot.status === "extended") {
        await tx.auditEvent.create({
          data: {
            pilotProgramId: pilot.id,
            actorJson: actorToJson(request.actor!) as Prisma.InputJsonValue,
            action: "pilot.extended_again",
            newStateJson: { expiresAt: newExpiresAt } as Prisma.InputJsonValue,
            reason: body.reason,
            relatedGrantIds: grantIds,
            sourceRoute: "POST /pilots/:id/extend",
            authorityClassification: "admin_action",
          },
        });
      } else {
        await transitionPilot(tx, {
          pilotProgramId: pilot.id,
          toState: "extended",
          actor: request.actor!,
          reason: body.reason,
          sourceRoute: "POST /pilots/:id/extend",
          authorityClassification: "admin_action",
          affectedGrantIds: grantIds,
          extraStateJson: { newExpiresAt },
        });
      }
    });

    reply.send({ expiresAt: newExpiresAt });
  });

  app.post<{ Params: { id: string } }>("/pilots/:id/suspend", async (request, reply) => {
    const body = parseBody(SuspendPilotSchema, request.body);
    const pilot = await loadPilotOr404(request.params.id);
    await prisma.$transaction((tx) =>
      transitionPilot(tx, {
        pilotProgramId: pilot.id,
        toState: "suspended",
        actor: request.actor!,
        reason: body.reason,
        sourceRoute: "POST /pilots/:id/suspend",
        authorityClassification: "admin_action",
      }),
    );
    reply.send({ status: "suspended" });
  });

  app.post<{ Params: { id: string } }>("/pilots/:id/revoke", async (request, reply) => {
    const body = parseBody(RevokePilotSchema, request.body);
    const pilot = await loadPilotOr404(request.params.id);

    await prisma.$transaction(async (tx) => {
      const { revokedGrantIds } = await revokeAllForPilot(tx, pilot.id, body.reason);
      await transitionPilot(tx, {
        pilotProgramId: pilot.id,
        toState: "revoked",
        actor: request.actor!,
        reason: body.reason,
        sourceRoute: "POST /pilots/:id/revoke",
        authorityClassification: "admin_action",
        affectedGrantIds: revokedGrantIds,
      });
    });

    reply.send({ status: "revoked" });
  });

  app.post<{ Params: { id: string } }>("/pilots/:id/reset", async (request, reply) => {
    const body = parseBody(ResetPilotSchema, request.body);
    const pilot = await loadPilotOr404(request.params.id);
    if (!["active", "extended", "extension_pending"].includes(pilot.status)) {
      throw new PilotControlPlaneError("pilot_not_resettable", `Pilot status '${pilot.status}' cannot be reset`, 409);
    }

    const result = await runReset(prisma, {
      pilotProgramId: pilot.id,
      actor: request.actor!,
      sourceRoute: "POST /pilots/:id/reset",
      idempotencyKey: body.idempotencyKey ?? `reset:${pilot.id}:${randomUUID()}`,
      reason: body.reason,
    });
    reply.send(result);
  });

  app.get<{ Params: { id: string } }>("/pilots/:id/audit", async (request) => {
    await loadPilotOr404(request.params.id);
    return listFormattedAuditTrail(prisma, request.params.id);
  });

  app.get<{ Params: { id: string } }>("/pilots/:id/usage", async (request) => {
    const pilot = await loadPilotOr404(request.params.id);
    const [usageEvents, environment] = await Promise.all([
      prisma.usageEvent.findMany({ where: { pilotProgramId: pilot.id }, orderBy: { occurredAt: "desc" } }),
      prisma.pilotEnvironment.findUnique({
        where: { pilotProgramId: pilot.id },
        include: { healthEvents: { orderBy: { occurredAt: "desc" }, take: 50 } },
      }),
    ]);
    // Kept as two distinct arrays deliberately -- system health and product
    // usage must never be folded into one score (see docs/ARCHITECTURE.md).
    return { usageEvents, healthEvents: environment?.healthEvents ?? [] };
  });

  app.post<{ Params: { id: string } }>("/pilots/:id/health-check", async (request, reply) => {
    await loadPilotOr404(request.params.id);
    const result = await checkHealth(prisma, { pilotProgramId: request.params.id, actor: request.actor! });
    reply.send(result);
  });

  app.post<{ Params: { id: string } }>("/pilots/:id/export", async (request, reply) => {
    const body = parseBody(CreateExportRequestSchema, request.body);
    const pilot = await loadPilotOr404(request.params.id);

    const exportRequest = await prisma.exportRequest.create({
      data: { pilotProgramId: pilot.id, requestedByActor: request.actor!.id, scopeJson: body.scope as unknown as Prisma.InputJsonValue },
    });

    const result = await runExport(prisma, {
      pilotProgramId: pilot.id,
      exportRequestId: exportRequest.id,
      actor: request.actor!,
      sourceRoute: "POST /pilots/:id/export",
      retentionDays: app.config.EXPORT_RETENTION_DAYS,
    });

    reply.status(201).send({ exportRequestId: exportRequest.id, ...result });
  });

  app.post<{ Params: { id: string } }>("/pilots/:id/destroy", async (request, reply) => {
    const body = parseBody(CreateDestructionRequestSchema, request.body);
    const pilot = await loadPilotOr404(request.params.id);

    const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : undefined;
    const destructionRequest = await prisma.destructionRequest.create({
      data: { pilotProgramId: pilot.id, requestedByActor: request.actor!.id, scheduledFor },
    });

    // A future scheduledFor defers execution to apps/worker's sweep; an
    // admin destroying "now" (the common case) executes immediately.
    if (scheduledFor && scheduledFor.getTime() > Date.now()) {
      reply.status(201).send({ destructionRequestId: destructionRequest.id, status: "pending", scheduledFor });
      return;
    }

    const result = await runDestruction(prisma, {
      pilotProgramId: pilot.id,
      destructionRequestId: destructionRequest.id,
      actor: request.actor!,
      sourceRoute: "POST /pilots/:id/destroy",
    });

    reply.status(201).send({ destructionRequestId: destructionRequest.id, ...result });
  });
}
