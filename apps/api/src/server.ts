import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import "./types.js";
import { loadEnv, type Env } from "./env.js";
import { handleError } from "./lib/errorHandler.js";
import { PINO_REDACT_PATHS } from "@venture-pilot/access-grants";
import adminAuthPlugin from "./plugins/adminAuth.js";
import participantAuthPlugin from "./plugins/participantAuth.js";
import { registerProductRoutes } from "./routes/products.js";
import { registerPilotsAdminRoutes } from "./routes/pilotsAdmin.js";
import { registerInvitationsPublicRoutes } from "./routes/invitationsPublic.js";
import { registerParticipantRoutes } from "./routes/participant.js";

// Any request path segment that could carry a raw invitation/session token
// must never reach the log verbatim -- Fastify's default request logger
// logs req.url, and pino's `redact` option only redacts object properties,
// not substrings inside a string field like a URL. A custom req serializer
// closes that gap.
function redactUrl(url: string): string {
  return url.replace(/\/invitations\/[^/]+\/redeem/, "/invitations/[Redacted]/redeem");
}

export interface BuildServerOptions {
  env?: Env;
  loggerStream?: NodeJS.WritableStream;
}

export function buildServer(opts: BuildServerOptions = {}): FastifyInstance {
  const env = opts.env ?? loadEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: { paths: PINO_REDACT_PATHS, censor: "[Redacted]" },
      serializers: {
        req(request) {
          return { method: request.method, url: redactUrl(request.url), hostname: request.hostname };
        },
      },
      ...(opts.loggerStream ? { stream: opts.loggerStream } : {}),
    },
  });

  app.decorate("config", env);
  app.setErrorHandler(handleError);

  app.register(cors, { origin: true });

  app.get("/healthz", async () => ({ ok: true }));

  app.register(async (adminScope) => {
    await adminScope.register(adminAuthPlugin);
    registerProductRoutes(adminScope);
    registerPilotsAdminRoutes(adminScope);
  });

  app.register(async (participantScope) => {
    await participantScope.register(participantAuthPlugin);
    registerParticipantRoutes(participantScope);
  });

  registerInvitationsPublicRoutes(app);

  return app;
}
