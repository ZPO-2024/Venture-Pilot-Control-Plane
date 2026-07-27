import { describe, expect, it } from "vitest";
import { createGenericMockAdapter } from "./base.js";
import type { AdapterContext } from "../types.js";

const ctx: AdapterContext = {
  pilotProgramId: "pilot_1",
  pilotOrgId: "org_1",
  environmentId: "env_1",
  idempotencyKey: "idem_1",
  actor: { type: "system", id: "test" },
};

describe("createGenericMockAdapter", () => {
  const adapter = createGenericMockAdapter({
    adapterKey: "test-adapter",
    productKey: "test-product",
    supportedVersions: ["1.0"],
  });

  it("provisionEnvironment is idempotent", async () => {
    const first = await adapter.provisionEnvironment(ctx, {}, { environmentTypeKey: "sandbox" });
    const second = await adapter.provisionEnvironment(ctx, first.state, { environmentTypeKey: "sandbox" });
    expect(first.data.provisioned).toBe(true);
    expect(second.data.provisioned).toBe(true);
  });

  it("loadDataset counts array-valued records", async () => {
    const result = await adapter.loadDataset(ctx, {}, {
      datasetVersionId: "dv_1",
      storageRef: "fixtures/x.json",
      digest: "abc123",
      recordsJson: { invoices: [1, 2, 3], contracts: [1] },
    });
    expect(result.data.recordCounts).toEqual({ invoices: 3, contracts: 1 });
  });

  it("createParticipantProjection scopes state per participant", async () => {
    const withEntitlements = await adapter.applyEntitlements(ctx, {}, { featureKeys: ["a", "b"] });
    const projected = await adapter.createParticipantProjection(ctx, withEntitlements.state, {
      participantId: "p_1",
      role: "evaluator",
    });
    expect(projected.data.visibleFeatureKeys).toEqual(["a", "b"]);
    expect(projected.state.participants).toHaveProperty("p_1");
  });

  it("resetEnvironment clears participant projections", async () => {
    const projected = await adapter.createParticipantProjection(ctx, {}, { participantId: "p_1", role: "evaluator" });
    const reset = await adapter.resetEnvironment(ctx, projected.state);
    expect(reset.state.participants).toEqual({});
  });

  it("destroyEnvironment zeroes record counts and returns a receipt", async () => {
    const loaded = await adapter.loadDataset(ctx, {}, {
      datasetVersionId: "dv_1",
      storageRef: "fixtures/x.json",
      digest: "abc123",
      recordsJson: { invoices: [1, 2] },
    });
    const destroyed = await adapter.destroyEnvironment(ctx, loaded.state);
    expect(destroyed.data.destroyed).toBe(true);
    expect(destroyed.data.receipt.recordCountsAtDestruction).toEqual({ invoices: 2 });
    expect(destroyed.state.recordCounts).toEqual({});
  });

  it("reportHealth reflects destroyed state as down", async () => {
    const destroyed = await adapter.destroyEnvironment(ctx, { provisioned: true });
    const health = await adapter.reportHealth(ctx, destroyed.state);
    expect(health.status).toBe("down");
  });
});
