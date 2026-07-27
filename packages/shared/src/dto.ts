import { z } from "zod";

export const CreateProductSchema = z.object({
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export const CreateProductVersionSchema = z.object({
  version: z.string().min(1).max(64),
  adapterKey: z.string().min(1).max(128),
  releaseNotes: z.string().max(2000).optional(),
  features: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        label: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        defaultEnabled: z.boolean().default(false),
      }),
    )
    .default([]),
  healthChecks: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        label: z.string().min(1).max(200),
        expectedIntervalSeconds: z.number().int().positive().default(300),
      }),
    )
    .default([]),
  environmentTypes: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        label: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
      }),
    )
    .default([]),
});
export type CreateProductVersionInput = z.infer<typeof CreateProductVersionSchema>;

export const PilotRoleSchema = z.enum(["primary_contact", "evaluator", "observer"]);

export const CreatePilotSchema = z.object({
  productKey: z.string().min(1),
  productVersion: z.string().min(1),
  templateKey: z.string().min(1),
  organization: z.object({
    name: z.string().min(1).max(200),
    primaryContactEmail: z.string().email(),
    primaryContactName: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
  }),
  name: z.string().min(1).max(200),
  durationDays: z.number().int().positive().max(90).optional(),
  environmentTypeKey: z.string().min(1),
  featureKeys: z.array(z.string()).default([]),
  participants: z
    .array(
      z.object({
        email: z.string().email(),
        displayName: z.string().max(200).optional(),
        role: PilotRoleSchema,
      }),
    )
    .default([]),
});
export type CreatePilotInput = z.infer<typeof CreatePilotSchema>;

export const IssueInvitationSchema = z.object({
  participantId: z.string().min(1),
  expiresInHours: z.number().int().positive().max(24 * 30).default(72),
});
export type IssueInvitationInput = z.infer<typeof IssueInvitationSchema>;

export const RedeemInvitationSchema = z.object({
  displayName: z.string().max(200).optional(),
});
export type RedeemInvitationInput = z.infer<typeof RedeemInvitationSchema>;

export const ExtendPilotSchema = z.object({
  additionalDays: z.number().int().positive().max(90),
  reason: z.string().min(1).max(1000),
});
export type ExtendPilotInput = z.infer<typeof ExtendPilotSchema>;

export const SuspendPilotSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type SuspendPilotInput = z.infer<typeof SuspendPilotSchema>;

export const RevokePilotSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type RevokePilotInput = z.infer<typeof RevokePilotSchema>;

export const ResetPilotSchema = z.object({
  reason: z.string().min(1).max(1000),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type ResetPilotInput = z.infer<typeof ResetPilotSchema>;

export const ProvisionPilotSchema = z.object({
  reason: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type ProvisionPilotInput = z.infer<typeof ProvisionPilotSchema>;

export const FeedbackCategorySchema = z.enum(["general", "issue"]);

export const SubmitFeedbackSchema = z.object({
  category: FeedbackCategorySchema.default("general"),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(5000).optional(),
  subject: z.string().max(300).optional(),
});
export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackSchema>;

export const RequestExtensionSchema = z.object({
  requestedDays: z.number().int().positive().max(90).optional(),
  message: z.string().max(1000).optional(),
});
export type RequestExtensionInput = z.infer<typeof RequestExtensionSchema>;

export const CreateExportRequestSchema = z.object({
  reason: z.string().max(1000).optional(),
  scope: z.array(z.string()).default(["audit", "usage", "feedback", "conversion"]),
});
export type CreateExportRequestInput = z.infer<typeof CreateExportRequestSchema>;

export const CreateDestructionRequestSchema = z.object({
  reason: z.string().min(1).max(1000),
  scheduledFor: z.string().datetime().optional(),
});
export type CreateDestructionRequestInput = z.infer<typeof CreateDestructionRequestSchema>;

export const GenerateConversionPacketSchema = z.object({
  recommendedPlan: z.string().max(4000).optional(),
  unresolvedRisks: z.string().max(4000).optional(),
  requestedChanges: z.array(z.string()).default([]),
});
export type GenerateConversionPacketInput = z.infer<typeof GenerateConversionPacketSchema>;

export const RecordUsageEventSchema = z.object({
  type: z.enum([
    "session_started",
    "product_opened",
    "major_feature_entered",
    "demonstration_workflow_completed",
    "error_encountered",
  ]),
  metadata: z.record(z.unknown()).default({}),
});
export type RecordUsageEventInput = z.infer<typeof RecordUsageEventSchema>;
