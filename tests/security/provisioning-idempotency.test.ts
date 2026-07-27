import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { runReset } from "@venture-pilot/provisioning";
import { createTestApp, createPilotFixture, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("provisioning idempotency", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("calling runReset twice with the same idempotencyKey reuses the cached result instead of creating a second run", async () => {
    const pilot = await createPilotFixture(app, { productKey: "forgeflow" });
    const idempotencyKey = `idem-test:${pilot.pilotId}`;

    const first = await runReset(prisma, {
      pilotProgramId: pilot.pilotId,
      actor: { type: "admin", id: "admin" },
      sourceRoute: "test",
      idempotencyKey,
      reason: "first call",
    });
    expect(first.cached).toBe(false);

    const second = await runReset(prisma, {
      pilotProgramId: pilot.pilotId,
      actor: { type: "admin", id: "admin" },
      sourceRoute: "test",
      idempotencyKey,
      reason: "second call, same key",
    });
    expect(second.cached).toBe(true);
    expect(second.recordCounts).toEqual(first.recordCounts);

    const runs = await prisma.provisioningRun.findMany({ where: { idempotencyKey } });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("succeeded");
  });

  it("a different idempotencyKey produces a distinct ProvisioningRun row", async () => {
    const pilot = await createPilotFixture(app, { productKey: "forgeflow" });

    await runReset(prisma, {
      pilotProgramId: pilot.pilotId,
      actor: { type: "admin", id: "admin" },
      sourceRoute: "test",
      idempotencyKey: `key-a:${pilot.pilotId}`,
      reason: "a",
    });
    await runReset(prisma, {
      pilotProgramId: pilot.pilotId,
      actor: { type: "admin", id: "admin" },
      sourceRoute: "test",
      idempotencyKey: `key-b:${pilot.pilotId}`,
      reason: "b",
    });

    const runs = await prisma.provisioningRun.findMany({ where: { pilotProgramId: pilot.pilotId, kind: "reset" } });
    expect(runs).toHaveLength(2);
  });
});
