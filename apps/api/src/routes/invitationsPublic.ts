import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { RedeemInvitationSchema, RateLimitedError } from "@venture-pilot/shared";
import { redeemInvitation, hashIp, SlidingWindowRateLimiter } from "@venture-pilot/access-grants";
import { createParticipantProjection } from "@venture-pilot/provisioning";
import { parseBody } from "../lib/validate.js";

export function registerInvitationsPublicRoutes(app: FastifyInstance): void {
  const limiter = new SlidingWindowRateLimiter(
    app.config.RATE_LIMIT_REDEMPTION_MAX,
    app.config.RATE_LIMIT_REDEMPTION_WINDOW_MS,
  );

  app.post<{ Params: { token: string } }>("/invitations/:token/redeem", async (request, reply) => {
    const rl = limiter.check(`redeem:${request.ip ?? "unknown"}`);
    if (!rl.allowed) {
      throw new RateLimitedError(rl.retryAfterMs);
    }

    const body = parseBody(RedeemInvitationSchema, request.body);

    const result = await redeemInvitation(prisma, {
      rawToken: request.params.token,
      displayName: body.displayName,
      userAgent: request.headers["user-agent"],
      ipHash: hashIp(request.ip ?? "unknown"),
      sourceRoute: "POST /invitations/:token/redeem",
    });

    try {
      await createParticipantProjection(prisma, {
        pilotProgramId: result.pilotProgramId,
        participantId: result.participantId,
        actor: { type: "participant", id: result.participantId },
      });
    } catch (err) {
      request.log.warn({ err }, "participant projection creation failed after redemption");
    }

    const pilot = await prisma.pilotProgram.findUnique({
      where: { id: result.pilotProgramId },
      include: { product: true },
    });

    reply.status(201).send({
      rawSessionToken: result.rawSessionToken,
      sessionExpiresAt: result.sessionExpiresAt,
      pilotName: pilot?.name,
      productName: pilot?.product.name,
    });
  });
}
