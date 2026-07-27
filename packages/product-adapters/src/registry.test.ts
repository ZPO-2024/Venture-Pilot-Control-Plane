import { describe, expect, it } from "vitest";
import { getAdapter, listRegisteredAdapterKeys } from "./registry.js";

describe("adapter registry", () => {
  it("registers all three required mock adapters", () => {
    expect(listRegisteredAdapterKeys().sort()).toEqual(
      ["document-concierge-demo", "forgeflow-kds-demo", "generic-web-application"].sort(),
    );
  });

  it("resolves each adapter with a distinct product identity", () => {
    const doc = getAdapter("document-concierge-demo").identify();
    const forge = getAdapter("forgeflow-kds-demo").identify();
    const generic = getAdapter("generic-web-application").identify();
    expect(new Set([doc.productKey, forge.productKey, generic.productKey]).size).toBe(3);
  });

  it("throws for an unknown adapter key", () => {
    expect(() => getAdapter("nonexistent-adapter")).toThrow(/No product adapter registered/);
  });
});
