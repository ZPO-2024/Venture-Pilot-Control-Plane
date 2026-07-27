# Architecture

## System shape

```
apps/admin (React/Vite)  ─┐
apps/participant-portal  ─┤──HTTP/JSON──▶ apps/api (Fastify) ──▶ Postgres
   (React/Vite)          ─┘                    │
                                                ▼
                                     packages/{access-grants,
                                       provisioning, entitlements,
                                       audit, shared} + product-adapters
                                                │
                                                ▼
                                    apps/worker (expiration/destruction sweep)
```

`apps/api` is the only process that talks to Postgres directly (via
`packages/db`'s Prisma client). `apps/worker` shares the same package
graph and runs on an interval, calling the same `packages/provisioning` /
`packages/shared` functions the API routes call — there is no separate
"worker-only" business logic path.

## Why Fastify

Two auth domains exist (admin bearer token, participant session token) and
they must never leak into each other's routes. Fastify's plugin
encapsulation makes that a registration-time fact:

```ts
app.register(async (adminScope) => {
  await adminScope.register(adminAuthPlugin);   // every route below requires admin auth
  registerProductRoutes(adminScope);
  registerPilotsAdminRoutes(adminScope);
});
app.register(async (participantScope) => {
  await participantScope.register(participantAuthPlugin);
  registerParticipantRoutes(participantScope);
});
registerInvitationsPublicRoutes(app); // no auth plugin -- rate-limited instead
```

There's no per-route auth checklist to forget — a route registered inside
`adminScope` cannot accidentally ship without admin auth. Fastify also
ships pino as its logger with first-class `redact` support and a
per-request child logger, which `docs/TOKEN_SECURITY.md` relies on.

## Package boundaries

| Package | Owns |
|---|---|
| `packages/db` | Prisma schema, migrations, seed, the generated client |
| `packages/shared` | Lifecycle state machine, error types, `Actor`, `Clock`, zod DTOs, fixture loading |
| `packages/access-grants` | Token crypto, invitation issuance/redemption, session validation/revocation, rate limiting, log redaction |
| `packages/product-adapters` | The `PilotProductAdapter` interface, the registry, the three mock adapters |
| `packages/provisioning` | Tenant-boundary verification, adapter invocation (provision/reset/health/export/destroy), idempotency |
| `packages/entitlements` | Feature-entitlement checks (pilot-scoped) and role-boundary checks (participant-action-scoped) |
| `packages/audit` | Human-readable audit-trail formatting, shared by the API and the admin cockpit |

Dependency direction is one-way: `access-grants` / `product-adapters` /
`entitlements` / `audit` depend on `db` and `shared`; `provisioning`
additionally depends on `product-adapters`; `apps/*` depend on all of the
above. Nothing in `packages/*` depends on `apps/*`.

## Request flow: redeeming an invitation

1. `POST /invitations/:token/redeem` (no auth plugin, but rate-limited by
   `SlidingWindowRateLimiter` keyed on client IP).
2. `access-grants.redeemInvitation()` — inside one Postgres transaction:
   hash the token, atomically claim the invitation row (`status='pending'
   AND expires_at > now()` in the `WHERE` clause), transition the pilot
   `invited -> active` on first redemption via `shared.transitionPilot()`,
   create the `AccessGrant` + `Session`, write one `AuditEvent`.
3. Outside that transaction (adapter calls are treated as network
   operations even when mocked): `provisioning.createParticipantProjection()`
   re-verifies the tenant chain and calls the registered adapter.
4. The raw session token is returned to the caller once and never
   persisted or logged again.

## Request flow: a pilot expiring

Enforcement is server-side and layered, not just a worker sweep:

- **On every authenticated participant request**, `access-grants.validateSession()`
  re-reads the session, grant, and pilot rows from Postgres and checks
  `shared.isAccessPermitted(pilot.status)` and `pilot.expiresAt` directly —
  this alone is enough to deny access to an expired pilot even if the
  background worker hasn't run yet.
- **The worker** (`apps/worker`, see `docs/PILOT_LIFECYCLE.md`) periodically
  transitions overdue pilots to `expired` through `transitionPilot()`, so
  the admin cockpit's status and "expiring soon" list stay accurate even
  when nobody is actively hitting the API.

## Usage vs. health vs. feedback vs. conversion — kept separate on purpose

`UsageEvent` and `HealthEvent` are different tables with different admin
routes (`GET /pilots/:id/usage` returns both as two distinct arrays, never
merged). `FeedbackRecord` and `ConversionRecord` are separate tables with
separate purposes (participant sentiment vs. an admin-authored commercial
packet). This directly satisfies the requirement that system health,
product usage, customer feedback, and commercial conversion state stay
visually and conceptually distinct in the admin cockpit — the API shape
enforces it; the UI can't accidentally fold them into one score.

## Error handling

Every domain error extends `PilotControlPlaneError` (`packages/shared/src/errors.ts`)
with a `code` and an `httpStatus`. `apps/api/src/lib/errorHandler.ts` maps
any instance straight to `{ error: { code, message } }` at that status; any
other thrown error becomes an opaque `500 internal_error` (logged
server-side, never leaking internals to the client).

## Extending the system

- **A new product**: implement `PilotProductAdapter`, register it in
  `packages/product-adapters/src/registry.ts`, register the `Product` /
  `ProductVersion` / features / dataset via `POST /products` and
  `POST /products/:id/versions`. Nothing else changes.
- **A new pilot-lifecycle transition**: add it to `PILOT_TRANSITIONS` in
  `packages/shared/src/lifecycle.ts` — every caller goes through
  `transitionPilot()`, so there's one place to update.
- **A new required security property**: add a test under `tests/security/`
  against the real Fastify app (`tests/helpers/testServer.ts`) and a real
  Postgres test database — every existing security test in this repo
  follows that pattern.
