import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { buildServer } from "../../apps/api/src/server.js";
import { loadEnv } from "../../apps/api/src/env.js";
import { resetPilotData } from "../helpers/testServer.js";

describe("rate limiting", () => {
  beforeEach(async () => {
    await resetPilotData();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("throttles repeated invitation-redemption attempts from the same client", async () => {
    const app: FastifyInstance = buildServer({
      env: { ...loadEnv(), RATE_LIMIT_REDEMPTION_MAX: 3, RATE_LIMIT_REDEMPTION_WINDOW_MS: 60_000 },
    });
    try {
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(
          await app.inject({
            method: "POST",
            url: "/invitations/nonexistent-token/redeem",
            headers: { "content-type": "application/json" },
            payload: {},
            remoteAddress: "203.0.113.7",
          }),
        );
      }

      const statusCodes = results.map((r) => r.statusCode);
      expect(statusCodes.slice(0, 3)).toEqual([401, 401, 401]); // invalid token, but under the limit
      expect(statusCodes.slice(3)).toEqual([429, 429]); // limit tripped
    } finally {
      await app.close();
    }
  });

  it("throttles repeated invalid admin-auth attempts from the same client", async () => {
    const app: FastifyInstance = buildServer({
      env: { ...loadEnv(), RATE_LIMIT_ADMIN_AUTH_MAX: 2, RATE_LIMIT_ADMIN_AUTH_WINDOW_MS: 60_000 },
    });
    try {
      const results = [];
      for (let i = 0; i < 4; i++) {
        results.push(
          await app.inject({
            method: "GET",
            url: "/products",
            headers: { authorization: "Bearer wrong-token" },
            remoteAddress: "203.0.113.8",
          }),
        );
      }
      const statusCodes = results.map((r) => r.statusCode);
      expect(statusCodes.slice(0, 2)).toEqual([401, 401]);
      expect(statusCodes.slice(2)).toEqual([429, 429]);
    } finally {
      await app.close();
    }
  });

  it("different clients (by IP) get independent rate-limit budgets", async () => {
    const app: FastifyInstance = buildServer({
      env: { ...loadEnv(), RATE_LIMIT_REDEMPTION_MAX: 1, RATE_LIMIT_REDEMPTION_WINDOW_MS: 60_000 },
    });
    try {
      const a1 = await app.inject({ method: "POST", url: "/invitations/x/redeem", payload: {}, headers: { "content-type": "application/json" }, remoteAddress: "203.0.113.1" });
      const a2 = await app.inject({ method: "POST", url: "/invitations/x/redeem", payload: {}, headers: { "content-type": "application/json" }, remoteAddress: "203.0.113.1" });
      const b1 = await app.inject({ method: "POST", url: "/invitations/x/redeem", payload: {}, headers: { "content-type": "application/json" }, remoteAddress: "203.0.113.2" });

      expect(a1.statusCode).toBe(401);
      expect(a2.statusCode).toBe(429);
      expect(b1.statusCode).toBe(401); // fresh budget for a different client
    } finally {
      await app.close();
    }
  });
});
