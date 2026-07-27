import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, createPilotFixture, issueAndRedeemInvitation, adminHeaders, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("audit event completeness", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("every pilot status transition through the API writes exactly one matching AuditEvent", async () => {
    const pilot = await createPilotFixture(app, { provision: false });

    await app.inject({ method: "POST", url: `/pilots/${pilot.pilotId}/provision`, headers: adminHeaders(), payload: {} });
    await issueAndRedeemInvitation(app, pilot.pilotId, pilot.participantId);
    await app.inject({
      method: "POST",
      url: `/pilots/${pilot.pilotId}/suspend`,
      headers: adminHeaders(),
      payload: { reason: "audit completeness test" },
    });

    const events = await prisma.auditEvent.findMany({ where: { pilotProgramId: pilot.pilotId }, orderBy: { occurredAt: "asc" } });
    const transitionActions = events.filter((e) => e.action.startsWith("pilot.transition."));
    const seenTransitions = transitionActions.map((e) => e.action);

    expect(seenTransitions).toContain("pilot.transition.draft_to_provisioning");
    expect(seenTransitions).toContain("pilot.transition.provisioning_to_ready");
    expect(seenTransitions).toContain("pilot.transition.ready_to_invited");
    expect(seenTransitions).toContain("pilot.transition.invited_to_active");
    expect(seenTransitions).toContain("pilot.transition.active_to_suspended");

    for (const event of transitionActions) {
      expect(event.actorJson).toBeTruthy();
      expect(event.reason).toBeTruthy();
      expect(event.sourceRoute).toBeTruthy();
      expect(event.authorityClassification).toBeTruthy();
      expect(event.priorStateJson).toBeTruthy();
      expect(event.newStateJson).toBeTruthy();
    }
  });

  it("no source file outside lifecycle.ts writes PilotProgram.status directly", () => {
    const repoRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
    const files = [
      ...globSync("apps/*/src/**/*.ts", { cwd: repoRoot }),
      ...globSync("packages/*/src/**/*.ts", { cwd: repoRoot }),
    ].filter((f) => !f.endsWith(".test.ts") && !f.endsWith("lifecycle.ts"));

    const offenders: string[] = [];
    for (const relativePath of files) {
      const contents = readFileSync(path.join(repoRoot, relativePath), "utf8");
      // Looks for a pilotProgram.update(...) call whose data object sets `status:`
      // directly (a naive but effective heuristic: transitionPilot() itself is
      // the only place this pattern legitimately appears, and it's excluded above).
      const suspiciousCall = /pilotProgram\.update\(\s*\{[\s\S]{0,300}?status\s*:/m;
      if (suspiciousCall.test(contents)) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });
});
