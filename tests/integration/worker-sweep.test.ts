import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { ManualClock } from "@venture-pilot/shared";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, adminHeaders, resetPilotData } from "../helpers/testServer.js";
import { runSweepOnce } from "../../apps/worker/src/sweep.js";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

let app: FastifyInstance;
const config = { expiringSoonThresholdHours: 48, exportRetentionDays: 14 };

describe("worker sweep", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("expires an overdue pilot: pilot status, participant status, sessions, and environment all flip together", async () => {
    const pilot = await createPilotFixture(app);
    const { rawSessionToken } = await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);

    await prisma.pilotProgram.update({ where: { id: pilot.pilotId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const clock = new ManualClock(new Date());
    await runSweepOnce(prisma, config, clock);

    const [updatedPilot, participant, session, environment] = await Promise.all([
      prisma.pilotProgram.findUniqueOrThrow({ where: { id: pilot.pilotId } }),
      prisma.pilotParticipant.findUniqueOrThrow({ where: { id: pilot.participantId } }),
      prisma.session.findFirstOrThrow({ where: { participantId: pilot.participantId } }),
      prisma.pilotEnvironment.findUniqueOrThrow({ where: { pilotProgramId: pilot.pilotId } }),
    ]);

    expect(updatedPilot.status).toBe("expired");
    expect(participant.status).toBe("expired");
    expect(session.revokedAt).not.toBeNull();
    expect(environment.status).toBe("suspended");

    const sessionCheck = await app.inject({ method: "GET", url: "/participant/session", headers: { authorization: `Bearer ${rawSessionToken}` } });
    expect(sessionCheck.statusCode).toBe(401);
  });

  it("creates one expiring-soon milestone and does not duplicate it on a second sweep", async () => {
    const pilot = await createPilotFixture(app);
    await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);
    await prisma.pilotProgram.update({ where: { id: pilot.pilotId }, data: { expiresAt: new Date(Date.now() + 60 * 60 * 1000) } }); // 1h out, within 48h threshold

    const clock = new ManualClock(new Date());
    await runSweepOnce(prisma, config, clock);
    await runSweepOnce(prisma, config, clock);

    const milestones = await prisma.pilotMilestone.findMany({ where: { pilotProgramId: pilot.pilotId, kind: "expiring_soon" } });
    expect(milestones).toHaveLength(1);
  });

  it("removes the export file and flips status to expired once the retention window passes", async () => {
    const pilot = await createPilotFixture(app, { participantRole: "primary_contact" });
    const exportRes = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/export`,
      headers: adminHeaders(),
      payload: {},
    });
    const { exportRequestId, storageRef } = exportRes.json();
    expect(existsSync(path.join(REPO_ROOT, storageRef))).toBe(true);

    await prisma.exportRequest.update({ where: { id: exportRequestId }, data: { retentionExpiresAt: new Date(Date.now() - 1000) } });

    const clock = new ManualClock(new Date());
    await runSweepOnce(prisma, config, clock);

    const updated = await prisma.exportRequest.findUniqueOrThrow({ where: { id: exportRequestId } });
    expect(updated.status).toBe("expired");
    expect(existsSync(path.join(REPO_ROOT, storageRef))).toBe(false);
  });

  it("executes a due scheduled destruction, and a blocked one once its blocking export is delivered", async () => {
    const pilot = await createPilotFixture(app, { participantRole: "primary_contact" });
    await app.inject({ method: "POST", url: `/pilots/${pilot.pilotId}/revoke`, headers: adminHeaders(), payload: { reason: "prep for destroy" } });

    // Create a pending export request (not yet delivered) to force the first destroy attempt to block.
    const pendingExport = await prisma.exportRequest.create({ data: { pilotProgramId: pilot.pilotId, requestedByActor: "admin" } });

    const destroyRes = await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/destroy`,
      headers: adminHeaders(),
      payload: { reason: "test destroy", scheduledFor: new Date(Date.now() + 60_000).toISOString() },
    });
    const { destructionRequestId } = destroyRes.json();
    expect(destroyRes.json().status).toBe("pending");

    // Not due yet.
    await runSweepOnce(prisma, config, new ManualClock(new Date()));
    let request = await prisma.destructionRequest.findUniqueOrThrow({ where: { id: destructionRequestId } });
    expect(request.status).toBe("pending");

    // Now due, but blocked by the undelivered export.
    await runSweepOnce(prisma, config, new ManualClock(new Date(Date.now() + 120_000)));
    request = await prisma.destructionRequest.findUniqueOrThrow({ where: { id: destructionRequestId } });
    expect(request.status).toBe("blocked");

    // Deliver the export out-of-band, then the next sweep should succeed.
    await prisma.exportRequest.update({ where: { id: pendingExport.id }, data: { status: "delivered", deliveredAt: new Date() } });
    await runSweepOnce(prisma, config, new ManualClock(new Date(Date.now() + 120_000)));

    request = await prisma.destructionRequest.findUniqueOrThrow({ where: { id: destructionRequestId } });
    expect(request.status).toBe("executed");
    const environment = await prisma.pilotEnvironment.findUniqueOrThrow({ where: { pilotProgramId: pilot.pilotId } });
    expect(environment.status).toBe("destroyed");
  });
});
