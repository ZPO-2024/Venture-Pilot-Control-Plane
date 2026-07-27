import { AuthorityClassification, Prisma, PilotStatus } from "@venture-pilot/db";
import type { Actor } from "./actor.js";
import { actorToJson } from "./actor.js";
import { InvalidTransitionError, NotFoundError } from "./errors.js";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";

// The single source of truth for which pilot-status transitions are legal.
// No route or worker job may update PilotProgram.status directly — every
// status change must go through transitionPilot() below, which is the only
// code path that (a) validates the transition and (b) writes the mandatory
// AuditEvent row. tests/security/audit-event-completeness.test.ts enforces
// this convention by scanning the codebase for direct status writes.
export const PILOT_TRANSITIONS: Record<PilotStatus, PilotStatus[]> = {
  draft: ["provisioning", "revoked"],
  provisioning: ["ready", "failed_provisioning"],
  failed_provisioning: ["provisioning", "revoked"],
  ready: ["invited", "revoked"],
  invited: ["active", "expired", "revoked", "declined"],
  active: ["extension_pending", "extended", "conversion_review", "suspended", "expired", "revoked"],
  extension_pending: ["extended", "active", "expired"],
  extended: ["extension_pending", "conversion_review", "suspended", "expired", "revoked"],
  conversion_review: ["converted", "extended", "active", "declined", "expired"],
  suspended: ["active", "extended", "revoked", "expired"],
  converted: ["exported", "destroyed"],
  declined: ["exported", "destroyed"],
  revoked: ["exported", "destroyed"],
  expired: ["conversion_review", "exported", "destroyed"],
  exported: ["destroyed"],
  destroyed: [],
};

export function assertTransition(from: PilotStatus, to: PilotStatus): void {
  const allowed = PILOT_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export interface TransitionPilotArgs {
  pilotProgramId: string;
  toState: PilotStatus;
  actor: Actor;
  reason: string;
  sourceRoute: string;
  authorityClassification: AuthorityClassification;
  affectedGrantIds?: string[];
  extraStateJson?: Record<string, unknown>;
}

// tx must be a Prisma transaction client ($transaction callback) so the
// status update and the AuditEvent write are atomic.
export async function transitionPilot(
  tx: Prisma.TransactionClient,
  args: TransitionPilotArgs,
): Promise<{ from: PilotStatus; to: PilotStatus }> {
  const pilot = await tx.pilotProgram.findUnique({ where: { id: args.pilotProgramId } });
  if (!pilot) {
    throw new NotFoundError("PilotProgram", args.pilotProgramId);
  }

  assertTransition(pilot.status, args.toState);

  await tx.pilotProgram.update({
    where: { id: args.pilotProgramId },
    data: { status: args.toState },
  });

  await tx.auditEvent.create({
    data: {
      pilotProgramId: args.pilotProgramId,
      actorJson: actorToJson(args.actor) as Prisma.InputJsonValue,
      action: `pilot.transition.${pilot.status}_to_${args.toState}`,
      priorStateJson: { status: pilot.status, ...args.extraStateJson } as Prisma.InputJsonValue,
      newStateJson: { status: args.toState } as Prisma.InputJsonValue,
      reason: args.reason,
      relatedProductId: pilot.productId,
      relatedGrantIds: args.affectedGrantIds ?? [],
      sourceRoute: args.sourceRoute,
      authorityClassification: args.authorityClassification,
    },
  });

  return { from: pilot.status, to: args.toState };
}

// States in which participant access is permitted at all. Used by
// packages/access-grants' session validation so an expired/suspended/
// revoked/destroyed pilot is rejected even against a cached session.
export const ACCESS_PERMITTED_STATES: readonly PilotStatus[] = [
  "active",
  "extension_pending",
  "extended",
];

export function isAccessPermitted(status: PilotStatus): boolean {
  return ACCESS_PERMITTED_STATES.includes(status);
}

export function isPilotExpired(expiresAt: Date | null, clock: Clock = systemClock): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= clock.now().getTime();
}
