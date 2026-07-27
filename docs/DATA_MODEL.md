# Data Model

Full schema: `packages/db/prisma/schema.prisma`. This is a narrative
walkthrough, grouped the same way as the schema file.

## Group A — Product catalog

`Product` → `ProductVersion` → (`ProductFeature`, `ProductHealthCheck`).
`ProductEnvironmentType` hangs off `Product` directly (different versions
of a product typically share environment types).

**`ProductAdapter` is not a table.** It's a code-level registry
(`packages/product-adapters/src/registry.ts`) keyed by the `adapterKey`
string stored on `ProductVersion`. A database row that just points at a TS
class would add nothing and risks drifting from what's actually
registered; a startup check asserts every `ProductVersion.adapterKey`
resolves to a registered adapter.

## Group B — Pilot / organization

`PilotOrganization` (the prospect) has many `PilotProgram`s (one per
product/version trial). A `PilotProgram` is the entity the required API
operates on — it *is* "the pilot" referenced by `POST /pilots`, `GET
/pilots/:id`, etc. It has one `PilotEnvironment` (1:1 — the provisioned
sandbox), many `PilotParticipant`s, and a `PilotMilestone` timeline.

`PilotStatus` and `PilotRole` are Postgres enums, not lookup tables — small
fixed vocabularies. Status *history* lives in `AuditEvent`, not in a
separate table.

## Group C — Access & security

Three deliberate collapses versus the spec's object list — each still
represents that object's data, just not as a separate table:

- **`AccessToken` → `Session.tokenHash`.** A session already *is* "a
  bearer credential hash for this participant"; a separate table would
  duplicate it.
- **`FeatureFlag` → `PilotEntitlement`.** Feature toggling here is
  pilot-scoped ("enable this feature set for this pilot"), not a global
  flag system. Role-based feature *visibility* is computed in code
  (`packages/entitlements`) by intersecting a pilot's enabled features
  with what its `PilotRole` may see, rather than exploding entitlement
  rows per participant × feature.
- **`Revocation` → status fields + `AuditEvent`.** `AccessGrant.revokedAt`
  / `revokedReason` and `Session.revokedAt` / `revokedReason`, plus the
  mandatory `AuditEvent` row every revoke writes, already capture who/when/why
  in full. A standalone table would just restate the same facts twice.

`Invitation.tokenHash` and `Session.tokenHash` store only HMAC-SHA256
hashes — see `docs/TOKEN_SECURITY.md`.

## Group D — Data lifecycle / provisioning

**`ResetRun` → `ProvisioningRun` via `kind` (`initial_provision` |
`reset`).** Both represent "run an adapter's provisioning path against an
environment, track idempotency/timing/result" — they differ only in which
adapter method is invoked. A separate table would duplicate every column.

`ProvisioningRun.idempotencyKey` is unique — `packages/provisioning`
checks for a prior successful run by key before ever calling an adapter
again.

`DatasetVersion.digest` is a SHA-256 of the fixture file contents, computed
at seed time — this is what "dataset-version mismatch" tests assert
against (an environment's `currentDatasetVersionId` must point at a
version whose digest still matches its `storageRef` file).

## Group E — Telemetry, feedback, conversion, audit

`UsageEvent` and `HealthEvent` are deliberately **separate tables**, not a
shared "telemetry event" with a discriminator — the spec requires
system-health and product-usage stay visually/conceptually distinct in the
admin cockpit, and a shared table invites a shared query that quietly
re-merges them.

**`SupportRequest` collapses into `FeedbackRecord`** with `category =
issue` (vs. `general`). The portal's "submit feedback" and "report an
issue" actions both write a `FeedbackRecord`; `subject` is used for
issues, `rating`/`comment` for general feedback. This was a deliberate MVP
scope trim — see the project handback for the tradeoff.

`AuditEvent` is the single most important table in the schema. Every
mutating route/worker job writes exactly **one** row here, always through
the guarded transition function in `packages/shared/src/lifecycle.ts` (for
status changes) or an equivalent explicit audit call (for non-status
mutations like invitation issuance or export requests). No code path
updates `PilotProgram.status` directly — see `docs/PILOT_LIFECYCLE.md`.

## Running migrations

```bash
pnpm db:migrate          # apply/create a dev migration (packages/db/prisma/migrations)
pnpm db:migrate:deploy    # apply existing migrations without creating a new one (CI/prod)
pnpm db:seed              # register the 3 demo products + versions + features + dataset versions
pnpm db:reset             # drop, recreate, migrate, and reseed the dev database
```

The initial migration (`packages/db/prisma/migrations/20260727205702_init`)
has been generated and applied against a real Postgres instance as part of
this build.
