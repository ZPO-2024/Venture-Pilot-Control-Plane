// Minimal local mirrors of the API's shapes. Deliberately not imported
// from @venture-pilot/shared -- that package pulls in Node-only modules
// (fs/crypto) that don't belong in a browser bundle, so the admin app
// keeps its own light, browser-safe type surface instead.

export type PilotStatus =
  | "draft"
  | "provisioning"
  | "ready"
  | "invited"
  | "active"
  | "extension_pending"
  | "extended"
  | "conversion_review"
  | "converted"
  | "expired"
  | "suspended"
  | "revoked"
  | "declined"
  | "failed_provisioning"
  | "exported"
  | "destroyed";

export type PilotRole = "primary_contact" | "evaluator" | "observer";

export interface ProductFeature {
  id: string;
  key: string;
  label: string;
  description?: string | null;
  defaultEnabled: boolean;
}

export interface ProductHealthCheck {
  id: string;
  key: string;
  label: string;
}

export interface ProductVersion {
  id: string;
  productId: string;
  version: string;
  adapterKey: string;
  isActive: boolean;
  features?: ProductFeature[];
  healthChecks?: ProductHealthCheck[];
}

export interface ProductEnvironmentType {
  id: string;
  productId: string;
  key: string;
  label: string;
}

export interface Product {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  versions: ProductVersion[];
  environmentTypes?: ProductEnvironmentType[];
}

export interface PilotParticipant {
  id: string;
  pilotProgramId: string;
  email: string;
  displayName?: string | null;
  role: PilotRole;
  status: string;
  invitedAt?: string | null;
}

export interface AccessGrant {
  id: string;
  participantId: string;
  role: PilotRole;
  status: string;
  expiresAt: string;
}

export interface PilotEntitlement {
  id: string;
  enabled: boolean;
  source: string;
  productFeature: ProductFeature;
}

export interface PilotEnvironment {
  id: string;
  status: string;
  lastHealthCheckAt?: string | null;
  environmentType?: ProductEnvironmentType;
  currentDatasetVersion?: { id: string; version: string } | null;
  healthEvents?: { id: string; status: string; occurredAt: string; detailJson: unknown }[];
}

export interface ProvisioningRun {
  id: string;
  kind: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  errorMessage?: string | null;
}

export interface FeedbackRecord {
  id: string;
  category: string;
  rating?: number | null;
  comment?: string | null;
  subject?: string | null;
  status: string;
  createdAt: string;
}

export interface ExportRequest {
  id: string;
  status: string;
  requestedAt: string;
  deliveredAt?: string | null;
  checksumDigest?: string | null;
}

export interface DestructionRequest {
  id: string;
  status: string;
  requestedAt: string;
  scheduledFor?: string | null;
  executedAt?: string | null;
  receiptDigest?: string | null;
}

export interface PilotSummary {
  id: string;
  name: string;
  status: PilotStatus;
  expiresAt?: string | null;
  createdAt: string;
  pilotOrg: { id: string; name: string };
  product: { id: string; key: string; name: string };
  productVersion: { id: string; version: string };
  participants: PilotParticipant[];
}

export interface PilotDetail extends PilotSummary {
  environment?: PilotEnvironment | null;
  accessGrants: AccessGrant[];
  entitlements: PilotEntitlement[];
  provisioningRuns: ProvisioningRun[];
  exportRequests: ExportRequest[];
  destructionRequests: DestructionRequest[];
  feedbackRecords: FeedbackRecord[];
  milestones: { id: string; kind: string; occurredAt: string; metadataJson: unknown }[];
  conversionRecord?: { id: string; status: string; generatedAt: string; packetJson: unknown } | null;
}

export interface AuditEventView {
  id: string;
  occurredAt: string;
  actorLabel: string;
  action: string;
  summary: string;
  reason: string | null;
  authorityClassification: string;
}

export interface UsageEventView {
  id: string;
  type: string;
  occurredAt: string;
  metadataJson: unknown;
}

export interface HealthEventView {
  id: string;
  status: string;
  occurredAt: string;
  detailJson: unknown;
}
