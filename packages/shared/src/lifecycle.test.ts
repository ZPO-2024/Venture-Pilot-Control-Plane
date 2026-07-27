import { describe, expect, it } from "vitest";
import { assertTransition, isAccessPermitted, isPilotExpired, PILOT_TRANSITIONS } from "./lifecycle.js";
import { InvalidTransitionError } from "./errors.js";
import { ManualClock } from "./clock.js";
import type { PilotStatus } from "@venture-pilot/db";

describe("PILOT_TRANSITIONS", () => {
  it("every referenced state has a table entry", () => {
    const allStates = new Set<PilotStatus>(Object.keys(PILOT_TRANSITIONS) as PilotStatus[]);
    for (const targets of Object.values(PILOT_TRANSITIONS)) {
      for (const target of targets) {
        expect(allStates.has(target)).toBe(true);
      }
    }
  });

  it("destroyed is terminal", () => {
    expect(PILOT_TRANSITIONS.destroyed).toEqual([]);
  });

  it("allows draft -> provisioning", () => {
    expect(() => assertTransition("draft", "provisioning")).not.toThrow();
  });

  it("rejects draft -> active (skipping provisioning/ready/invited)", () => {
    expect(() => assertTransition("draft", "active")).toThrow(InvalidTransitionError);
  });

  it("rejects any transition out of destroyed", () => {
    expect(() => assertTransition("destroyed", "active")).toThrow(InvalidTransitionError);
  });

  it("allows the full happy path draft..converted..destroyed", () => {
    const path: PilotStatus[] = [
      "draft",
      "provisioning",
      "ready",
      "invited",
      "active",
      "conversion_review",
      "converted",
      "destroyed",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertTransition(path[i]!, path[i + 1]!)).not.toThrow();
    }
  });

  it("allows revocation from active and from ready", () => {
    expect(() => assertTransition("active", "revoked")).not.toThrow();
    expect(() => assertTransition("ready", "revoked")).not.toThrow();
  });
});

describe("isAccessPermitted", () => {
  it("permits active, extension_pending, extended", () => {
    expect(isAccessPermitted("active")).toBe(true);
    expect(isAccessPermitted("extension_pending")).toBe(true);
    expect(isAccessPermitted("extended")).toBe(true);
  });

  it("denies expired, suspended, revoked, destroyed, draft", () => {
    for (const status of ["expired", "suspended", "revoked", "destroyed", "draft"] as PilotStatus[]) {
      expect(isAccessPermitted(status)).toBe(false);
    }
  });
});

describe("isPilotExpired", () => {
  it("returns false when expiresAt is null", () => {
    expect(isPilotExpired(null)).toBe(false);
  });

  it("returns true once the clock passes expiresAt", () => {
    const clock = new ManualClock(new Date("2026-01-01T00:00:00Z"));
    const expiresAt = new Date("2026-01-02T00:00:00Z");
    expect(isPilotExpired(expiresAt, clock)).toBe(false);
    clock.set(new Date("2026-01-02T00:00:01Z"));
    expect(isPilotExpired(expiresAt, clock)).toBe(true);
  });
});
