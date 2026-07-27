import type { AuditEvent, PrismaClient } from "@venture-pilot/db";

export interface FormattedAuditEvent {
  id: string;
  occurredAt: Date;
  actorLabel: string;
  action: string;
  summary: string;
  reason: string | null;
  authorityClassification: string;
}

interface ActorJson {
  type?: string;
  id?: string;
  label?: string | null;
}

function describeActor(actorJson: unknown): string {
  const actor = (actorJson ?? {}) as ActorJson;
  const label = actor.label ? ` (${actor.label})` : "";
  return `${actor.type ?? "unknown"}:${actor.id ?? "unknown"}${label}`;
}

function describeStateChange(priorStateJson: unknown, newStateJson: unknown): string | null {
  const prior = priorStateJson as { status?: string } | null;
  const next = newStateJson as { status?: string } | null;
  if (prior?.status && next?.status) {
    return `${prior.status} -> ${next.status}`;
  }
  return null;
}

/** Human-readable, timeline-friendly rendering of one AuditEvent — used by both the admin cockpit and GET /pilots/:id/audit. */
export function formatAuditEvent(event: AuditEvent): FormattedAuditEvent {
  const actorLabel = describeActor(event.actorJson);
  const stateChange = describeStateChange(event.priorStateJson, event.newStateJson);
  const summaryParts = [`${actorLabel} performed ${event.action}`];
  if (stateChange) summaryParts.push(`(${stateChange})`);
  if (event.reason) summaryParts.push(`— ${event.reason}`);

  return {
    id: event.id,
    occurredAt: event.occurredAt,
    actorLabel,
    action: event.action,
    summary: summaryParts.join(" "),
    reason: event.reason,
    authorityClassification: event.authorityClassification,
  };
}

export async function listFormattedAuditTrail(
  prisma: PrismaClient,
  pilotProgramId: string,
): Promise<FormattedAuditEvent[]> {
  const events = await prisma.auditEvent.findMany({
    where: { pilotProgramId },
    orderBy: { occurredAt: "asc" },
  });
  return events.map(formatAuditEvent);
}
