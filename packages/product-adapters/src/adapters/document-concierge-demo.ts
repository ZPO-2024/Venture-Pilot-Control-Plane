import { createGenericMockAdapter } from "./base.js";
import type { PilotProductAdapter } from "../types.js";

// Mock/local adapter standing in for Sovereign Document Concierge. A real
// adapter would call that product's actual provisioning API; this one
// simulates the same contract in-memory so the control plane is fully
// demonstrable before that integration exists (see docs/PRODUCT_ADAPTER_CONTRACT.md).
export const documentConciergeDemoAdapter: PilotProductAdapter = createGenericMockAdapter({
  adapterKey: "document-concierge-demo",
  productKey: "document-concierge",
  supportedVersions: ["0.1.0-demo"],
});
