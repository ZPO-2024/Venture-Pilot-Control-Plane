# Data Retention

## Default posture

```
expiration -> access blocked
           -> environment retained in a suspended state
           -> admin reviews for conversion or export
           -> environment destroyed or converted
```

Expiration never triggers destruction directly. The worker
(`apps/worker/src/sweep.ts`) only ever moves an overdue pilot to
`expired`, suspends its environment, expires its grants, and revokes its
sessions — it does not create or execute a `DestructionRequest`. Someone
(an admin, or a later-scheduled destruction an admin explicitly created)
has to make the destroy decision. See `docs/PILOT_LIFECYCLE.md` for the
full state machine.

## Export retention window

`ExportRequest.retentionExpiresAt` is set when an export is delivered
(`EXPORT_RETENTION_DAYS`, default 14). The worker sweep
(`sweepExportRetention`) deletes the on-disk export bundle
(`deployment/exports/<pilotId>/<exportRequestId>.json`) and flips the
request to `expired` once that window passes — this is the concrete
mechanism behind "do not retain customer information indefinitely."

## Destruction is blocked by an undelivered export

`packages/provisioning/src/destroy.ts::runDestruction` checks for any
`ExportRequest` in `pending` or `ready` status for the same pilot *before*
calling the adapter's `destroyEnvironment`. If one exists, the destruction
request is marked `blocked` (with a `blockingReason`) and the destroy call
throws rather than proceeding. This is the concrete mechanism behind "do
not automatically destroy evidence needed for audit or an approved
export."

The worker sweep retries any `blocked`/`pending` `DestructionRequest` that
is now due on every pass, so a destruction that was blocked self-heals the
moment the blocking export is delivered — no admin has to remember to
retry it.

## What destruction actually removes — and what it doesn't

`destroyEnvironment` (per-adapter) zeroes the adapter's own simulated
product data and returns a receipt (`packages/product-adapters/src/adapters/base.ts`).
`runDestruction` then:

- Sets `PilotEnvironment.status = destroyed` and persists the adapter's
  final (emptied) state.
- Writes the destruction receipt (`receiptJson`, `receiptDigest`) onto the
  `DestructionRequest` row.
- Transitions the pilot to `destroyed` via `transitionPilot()`, which
  writes the mandatory `AuditEvent`.

**Destruction does not delete the pilot's own control-plane history** —
`PilotProgram`, `PilotParticipant`, `AuditEvent`, `UsageEvent`,
`FeedbackRecord`, `ConversionRecord`, and the destruction/export request
rows themselves all survive. This is deliberate: the receipt, the audit
trail, and the commercial record of what happened during the trial are
exactly what a conversion decision or a post-hoc audit needs, and none of
it is "the product's data" — it's the control plane's own record of
having run the trial. Only the simulated product content inside
`PilotEnvironment.adapterState` is cleared.

## Retention of demo datasets and fixtures

`fixtures/**/dataset.json` are static, versioned, synthetic files — they
aren't "retained" in the privacy sense because they were never real data
in the first place (every file carries `synthetic: true` and a `notice`
field). `DatasetVersion.digest` pins which exact fixture content a given
pilot's environment was loaded from, so a fixture edit doesn't silently
change what an in-progress pilot is running against — see
`docs/PRODUCT_ADAPTER_CONTRACT.md`'s dataset-version-mismatch guard.

## Configuration

All retention/grace timings are environment variables, not hardcoded (see
`.env.example`):

| Variable | Default | Meaning |
|---|---|---|
| `DEFAULT_TRIAL_DURATION_DAYS` | 7 | Default pilot length if the admin doesn't override it |
| `EXPIRING_SOON_THRESHOLD_HOURS` | 48 | When the worker creates an `expiring_soon` milestone |
| `EXPORT_RETENTION_DAYS` | 14 | How long a delivered export stays on disk before the worker deletes it |
| `DESTRUCTION_GRACE_DAYS` | 3 | Reserved for a future "cool-off before scheduled destruction executes" policy; currently informational only — `POST /pilots/:id/destroy` executes immediately unless the admin explicitly passes a future `scheduledFor` |
