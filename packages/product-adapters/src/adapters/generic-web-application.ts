import { createGenericMockAdapter } from "./base.js";
import type { PilotProductAdapter } from "../types.js";

// A product-agnostic fallback adapter. Registered here for the
// "ai-notion-companion" product family (and reusable for any future ZPO
// application) to demonstrate that a product needs nothing more than this
// contract implemented once to become pilotable — see docs/PRODUCT_ADAPTER_CONTRACT.md.
export const genericWebApplicationAdapter: PilotProductAdapter = createGenericMockAdapter({
  adapterKey: "generic-web-application",
  productKey: "generic-web-application",
  supportedVersions: ["0.1.0-demo"],
});
