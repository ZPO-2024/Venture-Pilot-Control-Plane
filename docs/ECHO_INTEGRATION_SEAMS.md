# Echo Integration Seams

This document describes **future, not-yet-built** integration points
between the Venture Pilot Control Plane and Echo. Nothing in this file is
implemented. The control plane runs entirely standalone today — every
route, worker job, and adapter in this repository works with zero Echo
dependency — and this document exists so that a later integration has a
deliberate seam to attach to instead of requiring a rearchitecture.

**The control plane does not, and will not, claim canonical authority
over Echo state.** Where a future integration needs to represent
Echo-owned concepts (prospect identity, canonical memory, capability
grants), the control plane's role is to hold a *reference* to that state
and defer to Echo as the source of truth — never to fork or duplicate it.

## Why these seams, and where they'd attach

### 1. Action Contract for trial creation

`POST /pilots` today accepts an `Actor` (`packages/shared/src/actor.ts`)
that is always `{ type: "admin", id: "admin" }` under the current
shared-token MVP auth. A future Echo-driven trial-creation flow would
have Echo call an Action Contract that ultimately invokes the same
`POST /pilots` route (or the underlying `createPilot`-equivalent function
directly), supplying a real Echo-issued actor identity instead of the
shared admin token. No schema change needed — `Actor.id` is already a
free-form string threaded through every `AuditEvent`.

### 2. Protected prospect metadata

`PilotOrganization` today stores prospect contact info directly
(`name`, `primaryContactEmail`, `primaryContactName`, `notes`) as plain
control-plane data. If Echo becomes the canonical store for
prospect/customer relationship data, `PilotOrganization` would hold a
reference id (e.g. `echoProspectRef`) instead of — or alongside — the
current fields, with the control plane treating the referenced record as
read-only and Echo-owned.

### 3. Context packets for participant support

The participant portal's "report an issue" flow
(`FeedbackRecord` with `category = issue`) currently has no support
escalation path beyond the admin cockpit's Feedback tab. A context-packet
seam would let a support workflow (potentially Echo-orchestrated) pull a
structured bundle — pilot status, recent audit events, the specific
feedback record, product/adapter identity — without needing direct
database access. `packages/audit`'s formatting helpers are already
structured for exactly this kind of externally-consumable summary.

### 4. Pilot review cases

`ConversionRecord.packetJson` (Group E of the schema) already assembles
most of what a "pilot review case" needs — trial dates, participants,
features used, workflows completed, feedback, errors, extension history,
recommended plan, unresolved risks. A future seam would let Echo open a
review case referencing a `ConversionRecord` id rather than re-deriving
that packet from raw tables.

### 5. Challenge and feedback lineage

`FeedbackRecord` and `AuditEvent` currently have no notion of "this
feedback led to that follow-up action." A lineage seam would add a
reference field (e.g. `FeedbackRecord.echoChallengeRef`) so a
challenge/response thread in Echo can be traced back to the specific
pilot feedback that prompted it, without the control plane needing to
model challenge/response itself.

### 6. Transformation receipts

Every mutation in this system already produces exactly one `AuditEvent`
(`packages/shared/src/lifecycle.ts` and the equivalent explicit audit
calls for non-status mutations — see `docs/PILOT_LIFECYCLE.md`). If Echo
needs a receipt that a specific transformation happened (e.g. "this pilot
was converted, and here is proof"), `AuditEvent` rows are already
structured, ordered, and attributable (`actorJson`, `authorityClassification`,
`priorStateJson`/`newStateJson`) — the seam is exposing a subset of them
as signed/exportable receipts, not inventing a new record type.

### 7. Bounded publication or invitation actions

`packages/access-grants::createInvitation` already enforces that an
invitation is scoped to one pilot, one participant, one role, and one
expiration. A bounded Echo-driven invitation action would call this same
function (or the `POST /pilots/:id/invitations` route) rather than
generating tokens independently — the boundary enforcement
(`packages/provisioning::verifyTenantChain`, one-time redemption, etc.)
stays in one place regardless of what triggers issuance.

### 8. MCP resources for pilot status

`GET /pilots/:id`, `GET /pilots/:id/audit`, and `GET /pilots/:id/usage`
already return structured, read-only views of pilot state. An MCP
resource server exposing pilot status to Echo (or to an LLM-driven
support/sales assistant) would be a thin adapter over these existing
routes — no new business logic, just a different transport/schema
wrapper.

### 9. Capability leases for provisioning adapters

`packages/provisioning::invokeAdapter`-style calls (see
`docs/PRODUCT_ADAPTER_CONTRACT.md`) are already idempotent, tenant-scoped,
and auditable. A capability-lease seam would let Echo grant a
time-bounded, revocable capability for the control plane to provision a
*specific* product on Echo's behalf (rather than the control plane
holding a standing credential), with the lease id threaded through
`AdapterContext` alongside the existing `idempotencyKey`.

## What this explicitly does not mean right now

- No Echo SDK, client, or network call exists anywhere in this repository.
- No schema field named `echo*` exists yet — the seams above describe
  where such fields would go, not fields that exist.
- The control plane's acceptance criteria (see `README.md` and the
  project handback) are all satisfied without Echo. This document is
  forward-looking scope, not a dependency the current build carries.
