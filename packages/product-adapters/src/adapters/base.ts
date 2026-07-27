import type {
  AdapterContext,
  AdapterResult,
  AdapterState,
  AvailabilityResult,
  DatasetVersionRef,
  DestructionResult,
  EntitlementSet,
  ExportResult,
  HealthReport,
  LoadDatasetResult,
  ParticipantProjectionResult,
  ParticipantRef,
  PilotProductAdapter,
  ProvisionOptions,
} from "../types.js";

/**
 * A fully generic, in-memory, side-effect-free mock adapter: state is a
 * plain JSON object threaded through every call and persisted by the
 * caller onto PilotEnvironment.adapterState. Every method is idempotent —
 * calling it again with the same (or already-applied) input returns the
 * same shape of result rather than erroring or double-applying.
 *
 * Each of the three registered adapters (document-concierge-demo,
 * forgeflow-kds-demo, generic-web-application) is this same kit configured
 * with a different identity, which is the intended demonstration of
 * product-neutral reuse — a real product's adapter would replace this
 * in-memory simulation with actual calls to that product's provisioning
 * API, while keeping the same PilotProductAdapter contract.
 */
export function createGenericMockAdapter(opts: {
  adapterKey: string;
  productKey: string;
  supportedVersions: string[];
}): PilotProductAdapter {
  return {
    adapterKey: opts.adapterKey,

    identify() {
      return { productKey: opts.productKey, supportedVersions: opts.supportedVersions };
    },

    async verifyAvailability(_ctx: AdapterContext): Promise<AvailabilityResult> {
      return { available: true, detail: `${opts.adapterKey} mock adapter is always available locally` };
    },

    async provisionEnvironment(
      _ctx: AdapterContext,
      state: AdapterState,
      _opts: ProvisionOptions,
    ): Promise<AdapterResult<{ provisioned: true }>> {
      return {
        state: { ...state, provisioned: true, provisionedAt: new Date().toISOString() },
        data: { provisioned: true },
      };
    },

    async loadDataset(
      _ctx: AdapterContext,
      state: AdapterState,
      dataset: DatasetVersionRef,
    ): Promise<AdapterResult<LoadDatasetResult>> {
      const recordCounts = countRecords(dataset.recordsJson);
      return {
        state: {
          ...state,
          datasetVersionId: dataset.datasetVersionId,
          datasetDigest: dataset.digest,
          recordCounts,
        },
        data: { recordCounts, loadedDigest: dataset.digest },
      };
    },

    async createParticipantProjection(
      _ctx: AdapterContext,
      state: AdapterState,
      participant: ParticipantRef,
    ): Promise<AdapterResult<ParticipantProjectionResult>> {
      const participants = { ...(asRecord(state.participants)) };
      const entitledFeatureKeys = Array.isArray(state.entitledFeatureKeys)
        ? (state.entitledFeatureKeys as string[])
        : [];
      const projectionKey = `${opts.adapterKey}:${participant.participantId}`;
      participants[participant.participantId] = {
        projectionKey,
        role: participant.role,
        visibleFeatureKeys: entitledFeatureKeys,
      };
      return {
        state: { ...state, participants },
        data: { projectionKey, visibleFeatureKeys: entitledFeatureKeys },
      };
    },

    async applyEntitlements(
      _ctx: AdapterContext,
      state: AdapterState,
      entitlements: EntitlementSet,
    ): Promise<AdapterResult<void>> {
      return {
        state: { ...state, entitledFeatureKeys: entitlements.featureKeys },
        data: undefined,
      };
    },

    async reportHealth(_ctx: AdapterContext, state: AdapterState): Promise<HealthReport> {
      if (state.destroyed) {
        return { status: "down", detail: { reason: "environment destroyed" } };
      }
      if (!state.provisioned) {
        return { status: "unknown", detail: { reason: "not yet provisioned" } };
      }
      return {
        status: "healthy",
        detail: { recordCounts: state.recordCounts ?? {}, checkedAt: new Date().toISOString() },
      };
    },

    async resetEnvironment(
      _ctx: AdapterContext,
      state: AdapterState,
    ): Promise<AdapterResult<{ reset: true }>> {
      return {
        state: {
          ...state,
          participants: {},
          recordCounts: state.recordCounts ?? {},
          resetAt: new Date().toISOString(),
        },
        data: { reset: true },
      };
    },

    async exportPilotData(_ctx: AdapterContext, state: AdapterState): Promise<ExportResult> {
      return {
        files: [
          {
            name: "adapter-state-snapshot.json",
            contentJson: { adapterKey: opts.adapterKey, state },
          },
        ],
      };
    },

    async destroyEnvironment(
      _ctx: AdapterContext,
      state: AdapterState,
    ): Promise<AdapterResult<DestructionResult>> {
      const receipt = {
        adapterKey: opts.adapterKey,
        destroyedAt: new Date().toISOString(),
        recordCountsAtDestruction: state.recordCounts ?? {},
      };
      return {
        state: { ...state, destroyed: true, participants: {}, recordCounts: {} },
        data: { destroyed: true, receipt },
      };
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function countRecords(recordsJson: unknown): Record<string, number> {
  const record = asRecord(recordsJson);
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    counts[key] = Array.isArray(value) ? value.length : 1;
  }
  return counts;
}
