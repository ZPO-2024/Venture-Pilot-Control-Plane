import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { PilotControlPlaneError } from "@venture-pilot/shared";

export function handleError(err: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): void {
  if (err instanceof PilotControlPlaneError) {
    reply.status(err.httpStatus).send({ error: { code: err.code, message: err.message } });
    return;
  }

  // Fastify's own schema-validation / rate-limit errors carry a statusCode.
  const withStatus = err as FastifyError & { statusCode?: number };
  if (withStatus.statusCode && withStatus.statusCode < 500) {
    reply.status(withStatus.statusCode).send({ error: { code: "bad_request", message: err.message } });
    return;
  }

  request.log.error({ err }, "unhandled error");
  reply.status(500).send({ error: { code: "internal_error", message: "Internal server error" } });
}
