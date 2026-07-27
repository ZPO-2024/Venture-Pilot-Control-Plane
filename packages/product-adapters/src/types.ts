import type { Actor } from "@venture-pilot/shared";

/** Opaque per-environment state a mock adapter persists between calls. Stored verbatim as PilotEnvironment.adapterState (Json). */
export type AdapterState = Record<string, unknown>;

export interface AdapterContext {
  pilotProgramId: string;
  pilotOrgId: string;
  environmentId: string;
  idempotencyKey: string;
  actor: Actor;
}

export interface AdapterResult<T> {
  state: AdapterState;
  data: T;
}

export interface AvailabilityResult {
  available: boolean;
  detail?: string;
}

export interface ProvisionOptions {
  environmentTypeKey: string;
}

export interface DatasetVersionRef {
  datasetVersionId: string;
  storageRef: string;
  digest: string;
  recordsJson: unknown;
}

export interface LoadDatasetResult {
  recordCounts: Record<string, number>;
  loadedDigest: string;
}

export interface ParticipantRef {
  participantId: string;
  role: string;
  displayName?: string;
}

export interface ParticipantProjectionResult {
  projectionKey: string;
  visibleFeatureKeys: string[];
}

export interface EntitlementSet {
  featureKeys: string[];
}

export type HealthCheckStatus = "healthy" | "degraded" | "down" | "unknown";

export interface HealthReport {
  status: HealthCheckStatus;
  detail: Record<string, unknown>;
}

export interface ExportResult {
  files: { name: string; contentJson: unknown }[];
}

export interface DestructionResult {
  destroyed: true;
  receipt: Record<string, unknown>;
}

/**
 * The narrow contract every product implements to plug into the control
 * plane. Every call is scoped to exactly one pilot organization via
 * AdapterContext; packages/provisioning re-verifies that scoping against
 * live DB state before invoking any method here (an adapter must never be
 * trusted to enforce its own tenant boundary). Mutating methods are pure
 * functions of (ctx, currentState, ...) -> (newState, data), so replaying
 * the same idempotencyKey against the same state is safe.
 */
export interface PilotProductAdapter {
  readonly adapterKey: string;

  identify(): { productKey: string; supportedVersions: string[] };

  verifyAvailability(ctx: AdapterContext): Promise<AvailabilityResult>;

  provisionEnvironment(
    ctx: AdapterContext,
    state: AdapterState,
    opts: ProvisionOptions,
  ): Promise<AdapterResult<{ provisioned: true }>>;

  loadDataset(
    ctx: AdapterContext,
    state: AdapterState,
    dataset: DatasetVersionRef,
  ): Promise<AdapterResult<LoadDatasetResult>>;

  createParticipantProjection(
    ctx: AdapterContext,
    state: AdapterState,
    participant: ParticipantRef,
  ): Promise<AdapterResult<ParticipantProjectionResult>>;

  applyEntitlements(
    ctx: AdapterContext,
    state: AdapterState,
    entitlements: EntitlementSet,
  ): Promise<AdapterResult<void>>;

  reportHealth(ctx: AdapterContext, state: AdapterState): Promise<HealthReport>;

  resetEnvironment(ctx: AdapterContext, state: AdapterState): Promise<AdapterResult<{ reset: true }>>;

  exportPilotData(ctx: AdapterContext, state: AdapterState): Promise<ExportResult>;

  destroyEnvironment(ctx: AdapterContext, state: AdapterState): Promise<AdapterResult<DestructionResult>>;
}
