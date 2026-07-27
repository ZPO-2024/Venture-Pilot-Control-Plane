import type { FastifyInstance } from "fastify";
import { prisma, type Prisma } from "@venture-pilot/db";
import {
  RecordUsageEventSchema,
  SubmitFeedbackSchema,
  RequestExtensionSchema,
  CreateExportRequestSchema,
  TenantViolationError,
  PilotControlPlaneError,
  actorToJson,
  transitionPilot,
} from "@venture-pilot/shared";
import { listEnabledFeatureKeys, assertRolePermitted } from "@venture-pilot/entitlements";
import { parseBody } from "../lib/validate.js";

function assertOwnPilot(sessionPilotProgramId: string, paramPilotProgramId: string): void {
  if (sessionPilotProgramId !== paramPilotProgramId) {
    throw new TenantViolationError("This session does not belong to the requested pilot");
  }
}

export function registerParticipantRoutes(app: FastifyInstance): void {
  app.get("/participant/session", async (request) => {
    const session = request.participantSession!;
    const [pilot, visibleFeatureKeys] = await Promise.all([
      prisma.pilotProgram.findUniqueOrThrow({
        where: { id: session.pilotProgramId },
        include: { product: true },
      }),
      listEnabledFeatureKeys(prisma, session.pilotProgramId),
    ]);

    return {
      pilotProgramId: pilot.id,
      pilotName: pilot.name,
      productName: pilot.product.name,
      role: session.participantRole,
      expiresAt: pilot.expiresAt,
      status: pilot.status,
      syntheticDataNotice:
        "All data in this trial is synthetic and fabricated for demonstration purposes. No real customer data is present.",
      visibleFeatureKeys,
    };
  });

  app.post("/participant/events", async (request, reply) => {
    const body = parseBody(RecordUsageEventSchema, request.body);
    const session = request.participantSession!;
    const event = await prisma.usageEvent.create({
      data: {
        pilotProgramId: session.pilotProgramId,
        participantId: session.participantId,
        type: body.type,
        metadataJson: body.metadata as Prisma.InputJsonValue,
      },
    });
    reply.status(201).send(event);
  });

  app.post<{ Params: { id: string } }>("/pilots/:id/feedback", async (request, reply) => {
    const body = parseBody(SubmitFeedbackSchema, request.body);
    const session = request.participantSession!;
    assertOwnPilot(session.pilotProgramId, request.params.id);
    assertRolePermitted(session.participantRole as never, body.category === "issue" ? "report_issue" : "submit_feedback");

    const record = await prisma.$transaction(async (tx) => {
      const feedback = await tx.feedbackRecord.create({
        data: {
          pilotProgramId: session.pilotProgramId,
          participantId: session.participantId,
          category: body.category,
          rating: body.rating,
          comment: body.comment,
          subject: body.subject,
        },
      });
      await tx.usageEvent.create({
        data: {
          pilotProgramId: session.pilotProgramId,
          participantId: session.participantId,
          type: "feedback_submitted",
          metadataJson: { category: body.category } as Prisma.InputJsonValue,
        },
      });
      return feedback;
    });

    reply.status(201).send(record);
  });

  app.post("/participant/extension-requests", async (request, reply) => {
    const body = parseBody(RequestExtensionSchema, request.body);
    const session = request.participantSession!;
    assertRolePermitted(session.participantRole as never, "request_extension");

    const pilot = await prisma.pilotProgram.findUniqueOrThrow({ where: { id: session.pilotProgramId } });
    if (!["active", "extended"].includes(pilot.status)) {
      throw new PilotControlPlaneError("pilot_not_extendable", `Pilot status '${pilot.status}' cannot request an extension`, 409);
    }

    await prisma.$transaction(async (tx) => {
      await transitionPilot(tx, {
        pilotProgramId: pilot.id,
        toState: "extension_pending",
        actor: { type: "participant", id: session.participantId },
        reason: body.message ?? "Participant requested a trial extension",
        sourceRoute: "POST /participant/extension-requests",
        authorityClassification: "participant_action",
        extraStateJson: { requestedDays: body.requestedDays },
      });
      await tx.usageEvent.create({
        data: {
          pilotProgramId: pilot.id,
          participantId: session.participantId,
          type: "extension_requested",
          metadataJson: { requestedDays: body.requestedDays ?? null, message: body.message ?? null } as Prisma.InputJsonValue,
        },
      });
    });

    reply.status(201).send({ status: "extension_pending" });
  });

  app.post("/participant/export-requests", async (request, reply) => {
    const body = parseBody(CreateExportRequestSchema, request.body);
    const session = request.participantSession!;
    assertRolePermitted(session.participantRole as never, "request_export");

    const exportRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.exportRequest.create({
        data: {
          pilotProgramId: session.pilotProgramId,
          requestedByActor: session.participantId,
          scopeJson: body.scope as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.usageEvent.create({
        data: {
          pilotProgramId: session.pilotProgramId,
          participantId: session.participantId,
          type: "export_requested",
          metadataJson: {} as Prisma.InputJsonValue,
        },
      });
      await tx.auditEvent.create({
        data: {
          pilotProgramId: session.pilotProgramId,
          actorJson: actorToJson({ type: "participant", id: session.participantId }) as Prisma.InputJsonValue,
          action: "export_request.created",
          newStateJson: { exportRequestId: created.id } as Prisma.InputJsonValue,
          reason: body.reason ?? "Participant requested a data export",
          sourceRoute: "POST /participant/export-requests",
          authorityClassification: "participant_action",
        },
      });
      return created;
    });

    // Deliberately left in `pending` for admin review/execution via
    // POST /pilots/:id/export -- a participant can request an export of
    // their own trial's data, but fulfilling it is an admin action.
    reply.status(201).send(exportRequest);
  });

  app.post("/participant/logout", async (request, reply) => {
    const session = request.participantSession!;
    await prisma.session.update({
      where: { id: session.sessionId },
      data: { revokedAt: new Date(), revokedReason: "Participant signed out" },
    });
    reply.status(204).send();
  });
}
