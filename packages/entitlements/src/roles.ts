import type { PilotRole } from "@venture-pilot/db";
import { RoleNotPermittedError } from "@venture-pilot/shared";

/**
 * Participant actions gated purely by role, independent of any feature
 * entitlement. This is deliberately distinct from features.ts: a disabled
 * feature blocks everyone regardless of role (feature-entitlement
 * boundary); this matrix blocks an under-privileged role from an action
 * even when every feature is enabled (role boundary).
 */
export type ParticipantAction =
  | "view_product"
  | "submit_feedback"
  | "report_issue"
  | "complete_workflow"
  | "request_extension"
  | "request_export";

const ROLE_PERMISSIONS: Record<PilotRole, ParticipantAction[]> = {
  observer: ["view_product", "submit_feedback", "report_issue"],
  evaluator: ["view_product", "submit_feedback", "report_issue", "complete_workflow", "request_extension"],
  primary_contact: [
    "view_product",
    "submit_feedback",
    "report_issue",
    "complete_workflow",
    "request_extension",
    "request_export",
  ],
};

export function isRolePermitted(role: PilotRole, action: ParticipantAction): boolean {
  return ROLE_PERMISSIONS[role].includes(action);
}

export function assertRolePermitted(role: PilotRole, action: ParticipantAction): void {
  if (!isRolePermitted(role, action)) {
    throw new RoleNotPermittedError(action);
  }
}
