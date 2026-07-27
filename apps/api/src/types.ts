import "fastify";
import type { Actor } from "@venture-pilot/shared";
import type { ValidatedSession } from "@venture-pilot/access-grants";
import type { Env } from "./env.js";

declare module "fastify" {
  interface FastifyInstance {
    config: Env;
  }
  interface FastifyRequest {
    actor?: Actor;
    participantSession?: ValidatedSession;
  }
}
