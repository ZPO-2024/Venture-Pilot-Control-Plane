# Demo Script

Two full synthetic demonstration scenarios, proving the control plane
works end-to-end and is product-neutral. Both are implemented as real,
assertable tests — not prose you have to take on faith — in
`tests/scenarios/`.

## Run them

```bash
cp .env.test.example .env.test    # if you haven't already
pnpm test:db:up
pnpm test:db:migrate
pnpm --filter @venture-pilot/db seed   # registers both products against the test DB
pnpm test:scenarios
```

Or, against your local dev stack (`pnpm dev` running, dev DB migrated +
seeded): the same two spec files can be pointed at the dev API by
adjusting `DATABASE_URL`/`ADMIN_API_TOKEN`/`TOKEN_PEPPER` to match `.env`
instead of `.env.test` — `pnpm test:scenarios` as written targets
whatever `DATABASE_URL` is active in the environment it runs in.

## Scenario 1 — ForgeFlow "Example BBQ Pilot"

`tests/scenarios/forgeflow-bbq-pilot.test.ts`

1. **Register ForgeFlow / register a demonstration version** — verified
   already done by `pnpm db:seed` (`forgeflow-kds-demo` adapter).
2. **Create a synthetic mobile-food template & provision "Example BBQ
   Pilot"** — `POST /pilots` (org "Example BBQ Pilot Org", template
   `mobile-bbq-demo`, 7-day duration, `order_routing`/`kds_stations`/
   `offline_reconnect` enabled) then `POST /pilots/:id/provision`. Asserts
   the environment reaches `ready` and the synthetic order/catalog counts
   are non-zero.
3. **Issue a seven-day invitation** — `POST /pilots/:id/invitations`,
   asserts the expiry is ~7 days out.
4. **Redeem it as a participant** — `POST /invitations/:token/redeem`;
   asserts the pilot transitions `invited -> active`.
5. **Enter the synthetic product projection** — `GET
   /participant/session`; asserts the synthetic-data notice is present and
   the enabled features are visible.
6. **Record completion of the primary demonstration workflow** — `POST
   /participant/events` with `demonstration_workflow_completed`.
7. **Submit feedback** — `POST /pilots/:id/feedback` as the participant.
8. **Extend the pilot** — `POST /pilots/:id/extend`; asserts
   `expiresAt` moved forward and status is `extended`.
9. **Revoke access** — `POST /pilots/:id/revoke`.
10. **Verify the previous session can no longer enter** — the same
    session token now gets `401` from `GET /participant/session`.
11. **Export the pilot receipt** — `POST /pilots/:id/export`; asserts a
    real SHA-256 checksum and a storage path scoped to the pilot.
12. **Destroy the demonstration environment** — `POST /pilots/:id/destroy`;
    asserts a real destruction receipt digest and that both the pilot and
    its environment reach `destroyed`.

## Scenario 2 — Document Concierge pilot (product-neutrality proof)

`tests/scenarios/document-concierge-pilot.test.ts`

The identical 12-step lifecycle above, run against Sovereign Document
Concierge instead: template `professional-office-demo`,
`document_intake`/`deadline_tracking`/`duplicate_detection` features,
synthetic invoice/deadline record counts asserted instead of
order/catalog counts. Nothing about the control-plane code path differs —
only the product key, template, and expected record shapes — which is the
point: a second product family required zero changes to
`packages/provisioning`, `packages/access-grants`, or any API route.

## What this proves

Running both scenarios together exercises every item in the acceptance
checklist that concerns a live pilot's lifecycle (multi-product
registration, dataset provisioning, invitation issuance/redemption,
server-side expiration-adjacent enforcement via revoke, extension,
immediate revocation, dead sessions post-revocation, export, and
destruction with a receipt) against two independently adapted products,
with real assertions on real HTTP responses and real database state — not
a manual click-through.
