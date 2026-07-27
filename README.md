# Venture Pilot Control Plane

A reusable control plane for giving prospective customers secure,
time-limited access to demonstrations and pilot environments across
multiple ZPO products, without building a new trial-access mechanism for
every product.

> **Status:** local-only, in active development. No production billing, no
> real customer data, no public deployment. See `docs/PRODUCT_BOUNDARY.md`.

## What this is

Given a registered product (and version), an admin can spin up a
time-limited pilot for a prospect, provision synthetic demo data, invite
participants, watch usage/health/feedback come in, then extend, suspend,
revoke, convert, export, or destroy the pilot — all through one system,
regardless of which underlying product is being demonstrated.

See `docs/ARCHITECTURE.md` for the full system design and
`docs/PILOT_LIFECYCLE.md` for the state machine.

## Repository layout

```
apps/
  admin/               Admin cockpit (React + Vite)
  participant-portal/  Participant-facing trial portal (React + Vite)
  api/                 HTTP API (Fastify)
  worker/              Background sweep (expiration, destruction, notices)
packages/
  db/                  Prisma schema, migrations, seed, generated client
  shared/               Lifecycle state machine, DTOs, error types, Clock
  access-grants/        Token/session crypto, invitation redemption, rate limiting
  product-adapters/     PilotProductAdapter interface + mock adapters
  provisioning/         Adapter invocation, idempotency, tenant-boundary guard
  entitlements/         Feature-entitlement resolution by role
  audit/                Audit-event recording + human-readable formatting
fixtures/               Synthetic demo datasets (Document Concierge, ForgeFlow, generic)
tests/
  security/            Required security test suite (tenant isolation, tokens, etc.)
  scenarios/           End-to-end synthetic demo scenarios (ForgeFlow, Document Concierge)
  e2e/                 Playwright browser tests
deployment/            Backup/restore scripts, deployment notes
docs/                  Design docs (see below)
```

## Prerequisites

- Node.js >= 20
- pnpm 9.x (`corepack enable` will pick up the pinned version from `package.json`)
- Docker + Docker Compose (for Postgres, and for full-stack `docker compose up`)

## Local startup (development)

```bash
cp .env.example .env          # edit TOKEN_PEPPER / ADMIN_API_TOKEN for anything beyond local use
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev                      # runs api, worker, admin, participant-portal in parallel
```

- API: http://localhost:4000
- Admin cockpit: http://localhost:5173
- Participant portal: http://localhost:5174

## Local startup (full Docker Compose)

```bash
cp .env.example .env
docker compose up --build
```

This builds and runs Postgres, the API, the worker, and both frontends
(served as static builds behind nginx). See `docs/DEPLOYMENT.md`.

## Common commands

| Command | Purpose |
|---|---|
| `pnpm db:migrate` | Apply Prisma migrations to the dev database |
| `pnpm db:seed` | Register the 3 demo products/versions/templates + synthetic datasets |
| `pnpm db:reset` | Drop, recreate, migrate, and reseed the dev database |
| `pnpm test` | Run all Vitest unit/integration tests |
| `pnpm test:security` | Run only the required security test suite |
| `pnpm test:scenarios` | Run the two full synthetic demo scenarios end-to-end |
| `pnpm test:e2e` | Run Playwright browser tests |
| `pnpm build` | Production build of all apps/packages |
| `deployment/backup.sh` | Dump the Postgres database to `deployment/backups/` |
| `deployment/restore.sh <file>` | Restore a database dump |

## Running the synthetic demonstrations

See `docs/DEMO_SCRIPT.md` for the full walkthrough (ForgeFlow "Example BBQ
Pilot" and an equivalent Document Concierge pilot). The fastest way to see
both run end-to-end is:

```bash
pnpm test:scenarios
```

## Documentation

- `docs/PRODUCT_BOUNDARY.md` — what this system owns and does not own
- `docs/ARCHITECTURE.md` — system design, apps/packages, request flow
- `docs/DATA_MODEL.md` — Prisma schema walkthrough
- `docs/PILOT_LIFECYCLE.md` — the pilot state machine
- `docs/PRODUCT_ADAPTER_CONTRACT.md` — the `PilotProductAdapter` interface
- `docs/TOKEN_SECURITY.md` — invitation/session token design
- `docs/DATA_RETENTION.md` — export/destruction policy
- `docs/ECHO_INTEGRATION_SEAMS.md` — future (not yet built) Echo integration points
- `docs/DEPLOYMENT.md` — local and Docker Compose deployment
- `docs/DEMO_SCRIPT.md` — the two synthetic demonstration scenarios, step by step

## Security posture (local/demo MVP)

This build is scoped for local trials/demos run by a single operator. It
deliberately does **not** implement multi-admin RBAC, SSO, external
notifications, or a distributed rate limiter — see `docs/TOKEN_SECURITY.md`
and `docs/DEPLOYMENT.md` for what's a placeholder versus what's meant to
hold up if this is ever pointed at real (still non-production) traffic.
