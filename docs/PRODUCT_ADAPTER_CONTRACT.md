# Product Adapter Contract

Implementation: `packages/product-adapters` (the interface + registry + the
three shipped mock adapters), `packages/provisioning` (everything that
invokes an adapter safely).

## The interface

```ts
interface PilotProductAdapter {
  readonly adapterKey: string;
  identify(): { productKey: string; supportedVersions: string[] };
  verifyAvailability(ctx): Promise<AvailabilityResult>;
  provisionEnvironment(ctx, state, opts): Promise<AdapterResult<{ provisioned: true }>>;
  loadDataset(ctx, state, dataset): Promise<AdapterResult<LoadDatasetResult>>;
  createParticipantProjection(ctx, state, participant): Promise<AdapterResult<ParticipantProjectionResult>>;
  applyEntitlements(ctx, state, entitlements): Promise<AdapterResult<void>>;
  reportHealth(ctx, state): Promise<HealthReport>;
  resetEnvironment(ctx, state): Promise<AdapterResult<{ reset: true }>>;
  exportPilotData(ctx, state): Promise<ExportResult>;
  destroyEnvironment(ctx, state): Promise<AdapterResult<DestructionResult>>;
}
```

Full types: `packages/product-adapters/src/types.ts`.

Every mutating method is a **pure function of `(ctx, currentState, ...) ->
(newState, data)`**. `state` is opaque JSON persisted verbatim on
`PilotEnvironment.adapterState` by the caller — an adapter never manages
its own storage. This makes every method trivially idempotent: replaying
the same call against the same starting state produces the same result.

## What `packages/provisioning` guarantees before ever calling an adapter

An adapter is **never** trusted to enforce its own tenant boundary.
`verifyTenantChain()` (`packages/provisioning/src/tenant.ts`) re-derives
`pilotProgramId -> pilotOrgId -> environmentId` from a fresh Postgres read
immediately before every adapter invocation. A caller-supplied
`AdapterContext` claiming a mismatched pilot/environment pair throws
`AdapterTenantViolationError` before any adapter code runs — this is what
the required "cross-pilot adapter attempt" test exercises directly.

Provisioning and reset runs (the two `ProvisioningRun.kind`s) are also
guarded for idempotency: `runInitialProvisioning`/`runReset` look up any
existing run by `idempotencyKey` first, and return the cached result
instead of re-invoking the adapter if that run already succeeded.

Before loading a dataset, provisioning recomputes the fixture file's digest
and compares it to the registered `DatasetVersion.digest` — a mismatch
throws `DatasetVersionMismatchError` rather than silently loading stale or
tampered content.

## The three shipped adapters

| adapterKey | Product | Notes |
|---|---|---|
| `document-concierge-demo` | Sovereign Document Concierge | Mock/local |
| `forgeflow-kds-demo` | ForgeFlow / Universal KDS Bridge | Mock/local |
| `generic-web-application` | Any product without a dedicated adapter yet (registered here for AI Notion Companion) | Mock/local, product-neutral |

All three (`packages/product-adapters/src/adapters/*.ts`) are thin
configurations of one shared, fully generic, in-memory implementation
(`adapters/base.ts::createGenericMockAdapter`) — this is the concrete
demonstration of adapter reuse: a product needs nothing more than this
contract implemented once (however that implementation actually talks to
the real product) to become pilotable through the control plane. None of
the three calls out to echo-api, Document Concierge, or ForgeFlow — they
work fully standalone, which is required so the control plane is
demonstrable before those integrations exist.

## Writing a real adapter

A real (non-mock) adapter replaces the in-memory state simulation with
actual calls to that product's own provisioning surface (an internal API,
a CLI, a database seed script — whatever that product exposes), while
keeping every method:

- **Idempotent** — safe to call twice with the same inputs/state.
- **Authenticated** — using credentials scoped to demo/pilot use only,
  never production credentials (see `docs/PRODUCT_BOUNDARY.md`).
- **Retry-safe** — a network failure mid-call must not leave the adapter's
  own state inconsistent with what it reports back.
- **Auditable** — every state-changing call should be attributable, since
  `packages/provisioning` will already be recording who triggered it.
- **Bounded to one pilot organization** — an adapter implementation must
  not be able to read or write another tenant's data even by mistake; if
  the real product has its own tenant/workspace concept, the adapter must
  map one pilot to exactly one such scope.

Register a new adapter in `packages/product-adapters/src/registry.ts` and
point a `ProductVersion.adapterKey` at it — no other part of the control
plane needs to change.
