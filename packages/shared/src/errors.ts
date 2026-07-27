export class PilotControlPlaneError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class NotFoundError extends PilotControlPlaneError {
  constructor(entity: string, id: string) {
    super("not_found", `${entity} ${id} not found`, 404);
  }
}

export class InvalidTransitionError extends PilotControlPlaneError {
  constructor(from: string, to: string) {
    super("invalid_transition", `Cannot transition pilot from '${from}' to '${to}'`, 409);
  }
}

export class TenantViolationError extends PilotControlPlaneError {
  constructor(message = "Resource does not belong to the requesting pilot/tenant") {
    super("tenant_violation", message, 403);
  }
}

export class AdapterTenantViolationError extends PilotControlPlaneError {
  constructor(message = "Adapter call target does not belong to the given pilot organization") {
    super("adapter_tenant_violation", message, 403);
  }
}

export class UnauthorizedError extends PilotControlPlaneError {
  constructor(message = "Unauthorized") {
    super("unauthorized", message, 401);
  }
}

export class ForbiddenError extends PilotControlPlaneError {
  constructor(message = "Forbidden") {
    super("forbidden", message, 403);
  }
}

export class RateLimitedError extends PilotControlPlaneError {
  constructor(retryAfterMs: number) {
    super("rate_limited", `Too many requests, retry after ${retryAfterMs}ms`, 429);
  }
}

export class InvitationInvalidError extends PilotControlPlaneError {
  constructor(message = "Invitation token is invalid") {
    super("invitation_invalid", message, 401);
  }
}

export class InvitationExpiredError extends PilotControlPlaneError {
  constructor(message = "Invitation has expired") {
    super("invitation_expired", message, 410);
  }
}

export class InvitationAlreadyRedeemedError extends PilotControlPlaneError {
  constructor(message = "Invitation has already been redeemed") {
    super("invitation_already_redeemed", message, 409);
  }
}

export class SessionInvalidError extends PilotControlPlaneError {
  constructor(message = "Session is invalid, expired, or has been revoked") {
    super("session_invalid", message, 401);
  }
}

export class PilotAccessDeniedError extends PilotControlPlaneError {
  constructor(message = "Pilot access is not currently permitted (expired, suspended, or revoked)") {
    super("pilot_access_denied", message, 403);
  }
}

export class FeatureNotEntitledError extends PilotControlPlaneError {
  constructor(featureKey: string) {
    super("feature_not_entitled", `Feature '${featureKey}' is not entitled for this pilot/role`, 403);
  }
}

export class RoleNotPermittedError extends PilotControlPlaneError {
  constructor(action: string) {
    super("role_not_permitted", `Role is not permitted to perform '${action}'`, 403);
  }
}

export class ProvisioningError extends PilotControlPlaneError {
  constructor(message: string) {
    super("provisioning_error", message, 502);
  }
}

export class DatasetVersionMismatchError extends PilotControlPlaneError {
  constructor(message = "Dataset version digest does not match its stored content") {
    super("dataset_version_mismatch", message, 409);
  }
}

export class DestructionBlockedError extends PilotControlPlaneError {
  constructor(reason: string) {
    super("destruction_blocked", `Destruction blocked: ${reason}`, 409);
  }
}
