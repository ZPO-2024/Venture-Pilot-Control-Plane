import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { timingSafeEqualString, SlidingWindowRateLimiter } from "@venture-pilot/access-grants";
import { UnauthorizedError, RateLimitedError } from "@venture-pilot/shared";

/**
 * Encapsulated admin-auth plugin. Registered only within the /products and
 * /pilots (admin-facing) route groups via a Fastify plugin scope, so "this
 * route group requires admin auth" is a registration-time fact rather than
 * a per-route checklist item that's easy to forget.
 */
export default fp(async function adminAuthPlugin(app: FastifyInstance) {
  const limiter = new SlidingWindowRateLimiter(
    app.config.RATE_LIMIT_ADMIN_AUTH_MAX,
    app.config.RATE_LIMIT_ADMIN_AUTH_WINDOW_MS,
  );

  app.addHook("preHandler", async (request) => {
    const ip = request.ip ?? "unknown";
    const rl = limiter.check(`admin-auth:${ip}`);
    if (!rl.allowed) {
      throw new RateLimitedError(rl.retryAfterMs);
    }

    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing admin bearer token");
    }
    const provided = header.slice("Bearer ".length);
    if (!timingSafeEqualString(provided, app.config.ADMIN_API_TOKEN)) {
      throw new UnauthorizedError("Invalid admin token");
    }

    // Single-operator MVP: every admin request is attributed to the same
    // actor id. See docs/TOKEN_SECURITY.md for the real-SSO upgrade path.
    request.actor = { type: "admin", id: "admin", label: "Admin (shared token)" };
  });
});
