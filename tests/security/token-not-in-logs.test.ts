import { Writable } from "node:stream";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { buildServer } from "../../apps/api/src/server.js";
import { loadEnv } from "../../apps/api/src/env.js";
import { createPilotFixture, adminHeaders, resetPilotData } from "../helpers/testServer.js";

describe("token not present in logs", () => {
  beforeEach(async () => {
    await resetPilotData();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("neither the raw invitation token nor the raw session token ever appear in emitted logs", async () => {
    let buffer = "";
    const stream = new Writable({
      write(chunk, _enc, cb) {
        buffer += chunk.toString();
        cb();
      },
    });

    const app: FastifyInstance = buildServer({ env: loadEnv(), loggerStream: stream });
    try {
      const pilot = await createPilotFixture(app, { provision: true });

      const inviteRes = await app.inject({
        method: "POST",
        url: `/pilots/${pilot.pilotId}/invitations`,
        headers: adminHeaders(),
        payload: { participantId: pilot.participantId, expiresInHours: 168 },
      });
      const invite = inviteRes.json();
      expect(buffer).not.toContain(invite.rawToken);

      const redeemRes = await app.inject({
        method: "POST",
        url: `/invitations/${invite.rawToken}/redeem`,
        headers: { "content-type": "application/json" },
        payload: {},
      });
      const redeemed = redeemRes.json();

      expect(buffer).not.toContain(invite.rawToken);
      expect(buffer).not.toContain(redeemed.rawSessionToken);
      expect(buffer).not.toContain(loadEnv().ADMIN_API_TOKEN);
    } finally {
      await app.close();
    }
  });
});
