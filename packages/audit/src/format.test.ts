import { describe, expect, it } from "vitest";
import { formatAuditEvent } from "./format.js";
import type { AuditEvent } from "@venture-pilot/db";

function fakeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "evt_1",
    pilotProgramId: "pilot_1",
    actorJson: { type: "admin", id: "admin_1", label: "Brody" },
    action: "pilot.transition.draft_to_provisioning",
    priorStateJson: { status: "draft" },
    newStateJson: { status: "provisioning" },
    reason: "Admin provisioned the pilot",
    relatedProductId: "product_1",
    relatedGrantIds: [],
    sourceRoute: "POST /pilots/:id/provision",
    authorityClassification: "admin_action",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as AuditEvent;
}

describe("formatAuditEvent", () => {
  it("includes actor, action, state transition, and reason", () => {
    const formatted = formatAuditEvent(fakeEvent());
    expect(formatted.summary).toContain("admin:admin_1");
    expect(formatted.summary).toContain("Brody");
    expect(formatted.summary).toContain("draft -> provisioning");
    expect(formatted.summary).toContain("Admin provisioned the pilot");
  });

  it("omits the state-change clause when prior/new state have no status", () => {
    const formatted = formatAuditEvent(fakeEvent({ priorStateJson: null, newStateJson: null }));
    expect(formatted.summary).not.toContain("->");
  });

  it("handles a missing actor label gracefully", () => {
    const formatted = formatAuditEvent(fakeEvent({ actorJson: { type: "system", id: "worker" } }));
    expect(formatted.actorLabel).toBe("system:worker");
  });
});
