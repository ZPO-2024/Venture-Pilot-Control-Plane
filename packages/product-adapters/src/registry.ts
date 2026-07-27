import type { PilotProductAdapter } from "./types.js";
import { documentConciergeDemoAdapter } from "./adapters/document-concierge-demo.js";
import { forgeflowKdsDemoAdapter } from "./adapters/forgeflow-kds-demo.js";
import { genericWebApplicationAdapter } from "./adapters/generic-web-application.js";

const REGISTRY = new Map<string, PilotProductAdapter>(
  [documentConciergeDemoAdapter, forgeflowKdsDemoAdapter, genericWebApplicationAdapter].map((adapter) => [
    adapter.adapterKey,
    adapter,
  ]),
);

export function getAdapter(adapterKey: string): PilotProductAdapter {
  const adapter = REGISTRY.get(adapterKey);
  if (!adapter) {
    throw new Error(`No product adapter registered for adapterKey '${adapterKey}'`);
  }
  return adapter;
}

export function listRegisteredAdapterKeys(): string[] {
  return [...REGISTRY.keys()];
}
