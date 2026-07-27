import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { prisma } from "./client.js";

// Resolve fixtures/ relative to the repo root regardless of where this
// script is invoked from (pnpm --filter runs with cwd = package dir).
const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const FIXTURES_ROOT = path.join(REPO_ROOT, "fixtures");

function digestOf(filePath: string): string {
  const contents = readFileSync(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

interface ProductSeed {
  key: string;
  name: string;
  description: string;
  adapterKey: string;
  version: string;
  environmentTypeKey: string;
  environmentTypeLabel: string;
  features: { key: string; label: string; description: string; defaultEnabled: boolean }[];
  healthChecks: { key: string; label: string }[];
  datasetKey: string;
  datasetName: string;
  fixtureFile: string;
}

const PRODUCT_SEEDS: ProductSeed[] = [
  {
    key: "document-concierge",
    name: "Sovereign Document Concierge",
    description:
      "Document intake, classification, and deadline tracking for small professional offices.",
    adapterKey: "document-concierge-demo",
    version: "0.1.0-demo",
    environmentTypeKey: "sandbox",
    environmentTypeLabel: "Sandbox",
    features: [
      { key: "document_intake", label: "Document intake", description: "Upload and classify incoming documents", defaultEnabled: true },
      { key: "deadline_tracking", label: "Deadline tracking", description: "Surface upcoming contractual/warranty deadlines", defaultEnabled: true },
      { key: "duplicate_detection", label: "Duplicate detection", description: "Flag duplicate and amended records", defaultEnabled: false },
    ],
    healthChecks: [{ key: "adapter_reachable", label: "Adapter reachable" }],
    datasetKey: "document-concierge-synthetic-office",
    datasetName: "Synthetic Professional Office",
    fixtureFile: "document-concierge/dataset.json",
  },
  {
    key: "forgeflow",
    name: "ForgeFlow / Universal KDS Bridge",
    description: "Kitchen display and order-routing bridge for mobile and small-format food businesses.",
    adapterKey: "forgeflow-kds-demo",
    version: "0.1.0-demo",
    environmentTypeKey: "sandbox",
    environmentTypeLabel: "Sandbox",
    features: [
      { key: "order_routing", label: "Order routing", description: "Route incoming orders to stations", defaultEnabled: true },
      { key: "kds_stations", label: "KDS stations", description: "Kitchen display station views", defaultEnabled: true },
      { key: "offline_reconnect", label: "Offline / reconnect handling", description: "Simulated connectivity loss and recovery", defaultEnabled: false },
    ],
    healthChecks: [{ key: "adapter_reachable", label: "Adapter reachable" }],
    datasetKey: "forgeflow-synthetic-bbq",
    datasetName: "Synthetic Mobile BBQ Business",
    fixtureFile: "forgeflow/dataset.json",
  },
  {
    key: "ai-notion-companion",
    name: "AI Notion Companion",
    description:
      "General-purpose AI workspace companion. Demonstrated here via the generic-web-application adapter to prove adapter reuse across product families.",
    adapterKey: "generic-web-application",
    version: "0.1.0-demo",
    environmentTypeKey: "sandbox",
    environmentTypeLabel: "Sandbox",
    features: [
      { key: "workspace_projection", label: "Workspace projection", description: "Read-only projection of a synthetic workspace", defaultEnabled: true },
    ],
    healthChecks: [{ key: "adapter_reachable", label: "Adapter reachable" }],
    datasetKey: "generic-synthetic-workspace",
    datasetName: "Synthetic Generic Workspace",
    fixtureFile: "generic-web-application/dataset.json",
  },
];

async function main() {
  for (const seed of PRODUCT_SEEDS) {
    const product = await prisma.product.upsert({
      where: { key: seed.key },
      update: { name: seed.name, description: seed.description },
      create: { key: seed.key, name: seed.name, description: seed.description },
    });

    const version = await prisma.productVersion.upsert({
      where: { productId_version: { productId: product.id, version: seed.version } },
      update: { adapterKey: seed.adapterKey, isActive: true },
      create: {
        productId: product.id,
        version: seed.version,
        adapterKey: seed.adapterKey,
        releaseNotes: "Initial demo version.",
      },
    });

    await prisma.productEnvironmentType.upsert({
      where: { productId_key: { productId: product.id, key: seed.environmentTypeKey } },
      update: { label: seed.environmentTypeLabel },
      create: { productId: product.id, key: seed.environmentTypeKey, label: seed.environmentTypeLabel },
    });

    for (const feature of seed.features) {
      await prisma.productFeature.upsert({
        where: { productVersionId_key: { productVersionId: version.id, key: feature.key } },
        update: { label: feature.label, description: feature.description, defaultEnabled: feature.defaultEnabled },
        create: { productVersionId: version.id, ...feature },
      });
    }

    for (const check of seed.healthChecks) {
      await prisma.productHealthCheck.upsert({
        where: { productVersionId_key: { productVersionId: version.id, key: check.key } },
        update: { label: check.label },
        create: { productVersionId: version.id, ...check },
      });
    }

    const dataset = await prisma.demoDataset.upsert({
      where: { productId_key: { productId: product.id, key: seed.datasetKey } },
      update: { name: seed.datasetName },
      create: { productId: product.id, key: seed.datasetKey, name: seed.datasetName },
    });

    const fixturePath = path.join(FIXTURES_ROOT, seed.fixtureFile);
    let digest: string;
    try {
      digest = digestOf(fixturePath);
    } catch {
      console.warn(
        `[seed] fixture not found yet at ${fixturePath} — skipping DatasetVersion for ${seed.key}. Run again after fixtures/ is populated.`,
      );
      continue;
    }

    await prisma.datasetVersion.upsert({
      where: { demoDatasetId_version: { demoDatasetId: dataset.id, version: "1" } },
      update: { digest, storageRef: seed.fixtureFile },
      create: {
        demoDatasetId: dataset.id,
        version: "1",
        digest,
        storageRef: seed.fixtureFile,
        createdBy: "system:seed",
        supportedProductVersions: [seed.version],
        resetBehavior: "full_reset",
      },
    });

    console.log(`[seed] registered ${seed.name} (${seed.key}) v${seed.version}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
