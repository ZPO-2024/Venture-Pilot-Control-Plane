export interface SessionInfo {
  pilotProgramId: string;
  pilotName: string;
  productName: string;
  role: "primary_contact" | "evaluator" | "observer";
  expiresAt: string;
  status: string;
  syntheticDataNotice: string;
  visibleFeatureKeys: string[];
}

export interface RedeemResult {
  rawSessionToken: string;
  sessionExpiresAt: string;
  pilotName?: string;
  productName?: string;
}
