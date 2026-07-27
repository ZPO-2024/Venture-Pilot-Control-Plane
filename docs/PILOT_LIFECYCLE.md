# Pilot Lifecycle

## State machine

```
draft
  -> provisioning, revoked
provisioning
  -> ready, failed_provisioning
failed_provisioning
  -> provisioning, revoked
ready
  -> invited, revoked
invited
  -> active, expired, revoked, declined
active
  -> extension_pending, extended, conversion_review, suspended, expired, revoked
extension_pending
  -> extended, active, expired
extended
  -> extension_pending, conversion_review, suspended, expired, revoked
conversion_review
  -> converted, extended, active, declined, expired
suspended
  -> active, extended, revoked, expired
converted
  -> exported, destroyed
declined
  -> exported, destroyed
revoked
  -> exported, destroyed
expired
  -> conversion_review, exported, destroyed
exported
  -> destroyed
destroyed
  -> (terminal)
```

Source of truth: `packages/shared/src/lifecycle.ts` (`PILOT_TRANSITIONS`).

## The one rule

**No code updates `PilotProgram.status` directly.** Every status change goes
through `transitionPilot(tx, args)`, which — inside a single Prisma
transaction — re-reads the current row, validates the transition against
`PILOT_TRANSITIONS`, applies the new status, and writes exactly one
`AuditEvent` row recording:

- `actorJson` — who did this (admin / participant / system, with an id)
- `priorStateJson` / `newStateJson` — the status before and after
- `reason` — required, human-readable
- `relatedProductId` — the pilot's product, for cross-pilot/product queries
- `relatedGrantIds` — any access grants invalidated/created by this transition
- `sourceRoute` — which API route or worker job triggered it
- `authorityClassification` — `admin_action`, `participant_action`, or `system_automated`

This is enforced by convention *and* by a real test
(`tests/security/audit-event-completeness.test.ts`) that scans `apps/**/src`
and `packages/**/src` for `pilotProgram.update(...)` calls containing a
`status` key outside `lifecycle.ts`, and fails if it finds one.

## Who triggers what

| Transition | Trigger |
|---|---|
| draft → provisioning | Admin runs the pilot wizard's provision step |
| provisioning → ready / failed_provisioning | `packages/provisioning` reports the adapter result |
| ready → invited | Admin issues the first invitation |
| invited → active | Participant redeems an invitation |
| invited/active/extended → expired | Worker sweep, `PilotProgram.expiresAt` reached |
| active/extended → suspended | Admin suspends |
| suspended → active/extended | Admin reinstates |
| active/extended → revoked | Admin revokes (also bulk-revokes all sessions/grants) |
| active/extended → extension_pending | Participant requests an extension |
| extension_pending → extended | Admin approves the extension (sets a new `expiresAt`) |
| active/extended → conversion_review | Admin marks ready for conversion |
| conversion_review → converted | Admin approves conversion (generates `ConversionRecord`) |
| converted/declined/revoked/expired → exported | Admin/worker completes an `ExportRequest` |
| any terminal-adjacent state → destroyed | Admin/worker completes a `DestructionRequest` |

## Default posture on expiration

`expired` does **not** immediately destroy anything:

```
expiration -> access blocked (sessions/grants stop validating)
           -> environment retained in `suspended`-equivalent state
           -> admin reviews for conversion or export
           -> environment destroyed or converted
```

The worker sweep (`apps/worker`) never transitions a pilot straight to
`destroyed`. It only ever moves a pilot to `expired`, and only executes a
`DestructionRequest` that an admin (or a prior `exported` retention-window
sweep) has already scheduled — see `docs/DATA_RETENTION.md`.
