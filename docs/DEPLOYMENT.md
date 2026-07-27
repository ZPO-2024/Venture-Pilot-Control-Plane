# Deployment

Local and Docker Compose deployment only — this system is explicitly not
built or hardened for public/production hosting. See
`docs/PRODUCT_BOUNDARY.md`.

## Option A — local processes (fastest iteration)

```bash
cp .env.example .env               # edit ADMIN_API_TOKEN / TOKEN_PEPPER for anything beyond throwaway local use
pnpm install
docker compose up -d postgres      # or point DATABASE_URL at any Postgres 16 instance you already have
pnpm db:migrate
pnpm db:seed
pnpm dev                           # runs api, worker, admin, participant-portal together
```

- API: http://localhost:4000
- Admin cockpit: http://localhost:5173
- Participant portal: http://localhost:5174

`pnpm dev` runs all four apps with `pnpm --parallel -r --filter=./apps/**
dev` — `apps/api`/`apps/worker` run via `tsx watch` (no separate compile
step for the Node backend), `apps/admin`/`apps/participant-portal` run
their Vite dev servers.

## Option B — full Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

This builds and runs five services: `postgres`, `api`, `worker`, `admin`
(a static Vite build served by nginx), and `participant-portal` (same).
The `api` service's compose `command` runs `prisma migrate deploy` and the
seed script before starting, so a completely fresh `docker compose up
--build` needs no separate manual migration step.

| Service | Published port (default) |
|---|---|
| postgres | 5432 |
| api | 4000 |
| admin | 5173 |
| participant-portal | 5174 |

`admin` and `participant-portal` bake `VITE_API_BASE_URL` in at **build**
time (a Vite/browser constraint — env vars are compile-time, not
runtime). The default (`http://localhost:4000`) is correct as long as the
`api` service's port is published to the host, since it's the browser —
not the nginx container — that calls the API. Override via the
`VITE_API_BASE_URL` environment variable (read by `docker-compose.yml`'s
build `args`) if you're publishing the API on a different host/port.

`deployment/exports/` is bind-mounted into both `api` and `worker`
containers so exported pilot bundles and the worker's retention sweep
operate on the same files regardless of which container touches them.

**Note on this repository's build environment:** the sandbox this system
was built in has no Docker daemon available, so the Dockerfiles and
`docker-compose.yml` could be syntax- and variable-resolution-validated
(`docker compose config`, `docker compose -f docker-compose.test.yml
--env-file .env.test config`) but not built/run end-to-end. Everything
each Dockerfile's `CMD` actually runs (`pnpm start` in each app,
`prisma migrate deploy`, the seed script) was independently verified
working via direct execution throughout this build — see the docs for
each phase. Building the images end-to-end is the one deployment step
that still needs verification in an environment with Docker available.

## Test database

`pnpm test` needs its own Postgres, kept separate from the dev database so
test runs can freely truncate/reset:

```bash
cp .env.test.example .env.test
pnpm test:db:up        # docker-compose.test.yml, port 55432 by default
pnpm test:db:migrate
pnpm test               # or: pnpm test:security / pnpm test:scenarios
pnpm test:db:down       # when done
```

`docker-compose.yml` and `docker-compose.test.yml` intentionally use the
same-named `POSTGRES_*` variables for readability, which means Compose's
default auto-loaded `.env` would silently leak dev credentials/db-name
into the test container if you ran `docker compose -f
docker-compose.test.yml up` directly. `pnpm test:db:up` avoids this by
passing `--env-file .env.test` explicitly — use that script (or pass
`--env-file .env.test` yourself) rather than calling `docker compose -f
docker-compose.test.yml up` bare.

## Environment variables

See `.env.example` and `.env.test.example` for the full list with
descriptions. The ones that matter beyond throwaway local use:

- `ADMIN_API_TOKEN` / `TOKEN_PEPPER` — generate real random values
  (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
  before using this for anything beyond a fully local, single-operator
  demo. See `docs/TOKEN_SECURITY.md`.
- `DEFAULT_TRIAL_DURATION_DAYS`, `EXPIRING_SOON_THRESHOLD_HOURS`,
  `EXPORT_RETENTION_DAYS`, `DESTRUCTION_GRACE_DAYS` — trial/retention
  policy, safe to leave at their defaults.

## Production build (frontends)

```bash
pnpm build   # runs `build` in every workspace package that defines one --
             # currently apps/admin and apps/participant-portal
```

`apps/api` and `apps/worker` have no separate build step; they run
directly via `tsx` (see each Dockerfile).

## Backup / restore

See `deployment/backup.sh` and `deployment/restore.sh` — thin wrappers
around `pg_dump`/`pg_restore` against `DATABASE_URL`.
