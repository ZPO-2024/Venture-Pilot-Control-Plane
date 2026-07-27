-- CreateEnum
CREATE TYPE "PilotStatus" AS ENUM ('draft', 'provisioning', 'ready', 'invited', 'active', 'extension_pending', 'extended', 'conversion_review', 'converted', 'expired', 'suspended', 'revoked', 'declined', 'failed_provisioning', 'exported', 'destroyed');

-- CreateEnum
CREATE TYPE "PilotRole" AS ENUM ('primary_contact', 'evaluator', 'observer');

-- CreateEnum
CREATE TYPE "PilotEnvironmentStatus" AS ENUM ('provisioning', 'ready', 'suspended', 'failed', 'destroyed');

-- CreateEnum
CREATE TYPE "PilotParticipantStatus" AS ENUM ('invited', 'active', 'expired', 'revoked', 'declined');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'redeemed', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "AccessGrantStatus" AS ENUM ('active', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('template_default', 'admin_override');

-- CreateEnum
CREATE TYPE "SensitivityClassification" AS ENUM ('synthetic');

-- CreateEnum
CREATE TYPE "ProvisioningRunKind" AS ENUM ('initial_provision', 'reset');

-- CreateEnum
CREATE TYPE "ProvisioningRunStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "ExportRequestStatus" AS ENUM ('pending', 'ready', 'delivered', 'expired');

-- CreateEnum
CREATE TYPE "DestructionRequestStatus" AS ENUM ('pending', 'blocked', 'scheduled', 'executed');

-- CreateEnum
CREATE TYPE "UsageEventType" AS ENUM ('session_started', 'product_opened', 'major_feature_entered', 'demonstration_workflow_completed', 'error_encountered', 'feedback_submitted', 'extension_requested', 'export_requested');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('healthy', 'degraded', 'down', 'unknown');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('general', 'issue');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('open', 'acknowledged', 'resolved');

-- CreateEnum
CREATE TYPE "ConversionStatus" AS ENUM ('draft', 'ready_for_review', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "AuthorityClassification" AS ENUM ('admin_action', 'participant_action', 'system_automated');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_versions" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "adapterKey" TEXT NOT NULL,
    "releaseNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_environment_types" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "product_environment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_features" (
    "id" TEXT NOT NULL,
    "productVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "defaultEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_health_checks" (
    "id" TEXT NOT NULL,
    "productVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "expectedIntervalSeconds" INTEGER NOT NULL DEFAULT 300,

    CONSTRAINT "product_health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryContactEmail" TEXT NOT NULL,
    "primaryContactName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_programs" (
    "id" TEXT NOT NULL,
    "pilotOrgId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVersionId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PilotStatus" NOT NULL DEFAULT 'draft',
    "startAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdByActor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilot_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_environments" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT NOT NULL,
    "environmentTypeId" TEXT NOT NULL,
    "status" "PilotEnvironmentStatus" NOT NULL DEFAULT 'provisioning',
    "adapterState" JSONB NOT NULL DEFAULT '{}',
    "currentDatasetVersionId" TEXT,
    "lastHealthCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilot_environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_participants" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "PilotRole" NOT NULL,
    "status" "PilotParticipantStatus" NOT NULL DEFAULT 'invited',
    "invitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_milestones" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "sourceEventId" TEXT,

    CONSTRAINT "pilot_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "roleAtIssuance" "PilotRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "createdByActor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grants" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVersionId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "role" "PilotRole" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "AccessGrantStatus" NOT NULL DEFAULT 'active',
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_entitlements" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT NOT NULL,
    "productFeatureId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "source" "EntitlementSource" NOT NULL DEFAULT 'template_default',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilot_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "accessGrantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_datasets" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_versions" (
    "id" TEXT NOT NULL,
    "demoDatasetId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1',
    "digest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "sensitivityClassification" "SensitivityClassification" NOT NULL DEFAULT 'synthetic',
    "syntheticDeclaration" BOOLEAN NOT NULL DEFAULT true,
    "supportedProductVersions" TEXT[],
    "resetBehavior" TEXT NOT NULL DEFAULT 'full_reset',
    "storageRef" TEXT NOT NULL,

    CONSTRAINT "dataset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisioning_runs" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT NOT NULL,
    "pilotEnvironmentId" TEXT NOT NULL,
    "datasetVersionId" TEXT,
    "kind" "ProvisioningRunKind" NOT NULL,
    "status" "ProvisioningRunStatus" NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "resultJson" JSONB,
    "errorMessage" TEXT,
    "triggeredByActor" TEXT NOT NULL,

    CONSTRAINT "provisioning_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_requests" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT NOT NULL,
    "requestedByActor" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ExportRequestStatus" NOT NULL DEFAULT 'pending',
    "scopeJson" JSONB NOT NULL DEFAULT '{}',
    "deliveredAt" TIMESTAMP(3),
    "storageRef" TEXT,
    "retentionExpiresAt" TIMESTAMP(3),
    "checksumDigest" TEXT,

    CONSTRAINT "export_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destruction_requests" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT NOT NULL,
    "requestedByActor" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DestructionRequestStatus" NOT NULL DEFAULT 'pending',
    "scheduledFor" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "receiptDigest" TEXT,
    "receiptJson" JSONB,
    "blockingReason" TEXT,

    CONSTRAINT "destruction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT NOT NULL,
    "participantId" TEXT,
    "type" "UsageEventType" NOT NULL,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_events" (
    "id" TEXT NOT NULL,
    "pilotEnvironmentId" TEXT NOT NULL,
    "productHealthCheckId" TEXT,
    "status" "HealthStatus" NOT NULL,
    "detailJson" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_records" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "category" "FeedbackCategory" NOT NULL DEFAULT 'general',
    "rating" INTEGER,
    "comment" TEXT,
    "subject" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_records" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT NOT NULL,
    "status" "ConversionStatus" NOT NULL DEFAULT 'draft',
    "packetJson" JSONB NOT NULL,
    "recommendedPlan" TEXT,
    "unresolvedRisks" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedByActor" TEXT NOT NULL,
    "crmRefId" TEXT,

    CONSTRAINT "conversion_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "pilotProgramId" TEXT,
    "actorJson" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "priorStateJson" JSONB,
    "newStateJson" JSONB,
    "reason" TEXT,
    "relatedProductId" TEXT,
    "relatedGrantIds" TEXT[],
    "sourceRoute" TEXT NOT NULL,
    "authorityClassification" "AuthorityClassification" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_key_key" ON "products"("key");

-- CreateIndex
CREATE UNIQUE INDEX "product_versions_productId_version_key" ON "product_versions"("productId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "product_environment_types_productId_key_key" ON "product_environment_types"("productId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "product_features_productVersionId_key_key" ON "product_features"("productVersionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "product_health_checks_productVersionId_key_key" ON "product_health_checks"("productVersionId", "key");

-- CreateIndex
CREATE INDEX "pilot_programs_status_idx" ON "pilot_programs"("status");

-- CreateIndex
CREATE INDEX "pilot_programs_expiresAt_idx" ON "pilot_programs"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "pilot_environments_pilotProgramId_key" ON "pilot_environments"("pilotProgramId");

-- CreateIndex
CREATE UNIQUE INDEX "pilot_participants_pilotProgramId_email_key" ON "pilot_participants"("pilotProgramId", "email");

-- CreateIndex
CREATE INDEX "pilot_milestones_pilotProgramId_kind_idx" ON "pilot_milestones"("pilotProgramId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_pilotProgramId_idx" ON "invitations"("pilotProgramId");

-- CreateIndex
CREATE INDEX "access_grants_pilotProgramId_status_idx" ON "access_grants"("pilotProgramId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pilot_entitlements_pilotProgramId_productFeatureId_key" ON "pilot_entitlements"("pilotProgramId", "productFeatureId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_accessGrantId_idx" ON "sessions"("accessGrantId");

-- CreateIndex
CREATE UNIQUE INDEX "demo_datasets_productId_key_key" ON "demo_datasets"("productId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_versions_demoDatasetId_version_key" ON "dataset_versions"("demoDatasetId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "provisioning_runs_idempotencyKey_key" ON "provisioning_runs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "provisioning_runs_pilotProgramId_idx" ON "provisioning_runs"("pilotProgramId");

-- CreateIndex
CREATE INDEX "export_requests_pilotProgramId_idx" ON "export_requests"("pilotProgramId");

-- CreateIndex
CREATE INDEX "destruction_requests_pilotProgramId_idx" ON "destruction_requests"("pilotProgramId");

-- CreateIndex
CREATE INDEX "usage_events_pilotProgramId_type_idx" ON "usage_events"("pilotProgramId", "type");

-- CreateIndex
CREATE INDEX "health_events_pilotEnvironmentId_idx" ON "health_events"("pilotEnvironmentId");

-- CreateIndex
CREATE INDEX "feedback_records_pilotProgramId_category_idx" ON "feedback_records"("pilotProgramId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_records_pilotProgramId_key" ON "conversion_records"("pilotProgramId");

-- CreateIndex
CREATE INDEX "audit_events_pilotProgramId_occurredAt_idx" ON "audit_events"("pilotProgramId", "occurredAt");

-- AddForeignKey
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_environment_types" ADD CONSTRAINT "product_environment_types_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_features" ADD CONSTRAINT "product_features_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "product_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_health_checks" ADD CONSTRAINT "product_health_checks_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "product_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_programs" ADD CONSTRAINT "pilot_programs_pilotOrgId_fkey" FOREIGN KEY ("pilotOrgId") REFERENCES "pilot_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_programs" ADD CONSTRAINT "pilot_programs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_programs" ADD CONSTRAINT "pilot_programs_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "product_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_environments" ADD CONSTRAINT "pilot_environments_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_environments" ADD CONSTRAINT "pilot_environments_environmentTypeId_fkey" FOREIGN KEY ("environmentTypeId") REFERENCES "product_environment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_environments" ADD CONSTRAINT "pilot_environments_currentDatasetVersionId_fkey" FOREIGN KEY ("currentDatasetVersionId") REFERENCES "dataset_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_participants" ADD CONSTRAINT "pilot_participants_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_milestones" ADD CONSTRAINT "pilot_milestones_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "pilot_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "pilot_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "product_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "pilot_environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_entitlements" ADD CONSTRAINT "pilot_entitlements_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_entitlements" ADD CONSTRAINT "pilot_entitlements_productFeatureId_fkey" FOREIGN KEY ("productFeatureId") REFERENCES "product_features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "pilot_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_accessGrantId_fkey" FOREIGN KEY ("accessGrantId") REFERENCES "access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_datasets" ADD CONSTRAINT "demo_datasets_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_demoDatasetId_fkey" FOREIGN KEY ("demoDatasetId") REFERENCES "demo_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_runs" ADD CONSTRAINT "provisioning_runs_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_runs" ADD CONSTRAINT "provisioning_runs_pilotEnvironmentId_fkey" FOREIGN KEY ("pilotEnvironmentId") REFERENCES "pilot_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_runs" ADD CONSTRAINT "provisioning_runs_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "dataset_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_requests" ADD CONSTRAINT "export_requests_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destruction_requests" ADD CONSTRAINT "destruction_requests_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "pilot_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_pilotEnvironmentId_fkey" FOREIGN KEY ("pilotEnvironmentId") REFERENCES "pilot_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_productHealthCheckId_fkey" FOREIGN KEY ("productHealthCheckId") REFERENCES "product_health_checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_records" ADD CONSTRAINT "feedback_records_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_records" ADD CONSTRAINT "feedback_records_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "pilot_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_records" ADD CONSTRAINT "conversion_records_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_pilotProgramId_fkey" FOREIGN KEY ("pilotProgramId") REFERENCES "pilot_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_relatedProductId_fkey" FOREIGN KEY ("relatedProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
