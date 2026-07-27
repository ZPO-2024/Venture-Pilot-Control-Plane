import { createGenericMockAdapter } from "./base.js";
import type { PilotProductAdapter } from "../types.js";

// Mock/local adapter standing in for ForgeFlow / Universal KDS Bridge. A
// real adapter would call that product's actual provisioning API; this one
// simulates the same contract in-memory (see docs/PRODUCT_ADAPTER_CONTRACT.md).
export const forgeflowKdsDemoAdapter: PilotProductAdapter = createGenericMockAdapter({
  adapterKey: "forgeflow-kds-demo",
  productKey: "forgeflow",
  supportedVersions: ["0.1.0-demo"],
});
