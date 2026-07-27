import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { validateSession } from "@venture-pilot/access-grants";
import { UnauthorizedError } from "@venture-pilot/shared";

/**
 * Encapsulated participant-auth plugin. validateSession() re-reads live DB
 * state on every call (see docs/TOKEN_SECURITY.md) — there is no cached
 * claim here to go stale, which is what makes "expired pilot rejected even
 * with a cached session" hold structurally rather than by convention.
 */
export default fp(async function participantAuthPlugin(app: FastifyInstance) {
  app.addHook("preHandler", async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing participant session token");
    }
    const rawToken = header.slice("Bearer ".length);
    request.participantSession = await validateSession(prisma, rawToken);
  });
});
