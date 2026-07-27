import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { createTestApp, resetPilotData } from "../helpers/testServer.js";

let app: FastifyInstance;

describe("invalid token", () => {
  beforeEach(async () => {
    await resetPilotData();
    app = createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects an invitation redemption for a token that was never issued", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/invitations/totally-made-up-token-value/redeem",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("invitation_invalid");
  });

  it("rejects a participant session request with a random bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/participant/session",
      headers: { authorization: "Bearer not-a-real-session-token" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("session_invalid");
  });

  it("rejects an admin request with a random bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/products",
      headers: { authorization: "Bearer not-the-admin-token" },
    });
    expect(res.statusCode).toBe(401);
  });
});
