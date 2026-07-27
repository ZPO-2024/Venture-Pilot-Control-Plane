export const ADMIN_URL = process.env.E2E_ADMIN_URL ?? "http://localhost:5173";
export const PORTAL_URL = process.env.E2E_PORTAL_URL ?? "http://localhost:5174";
export const API_URL = process.env.E2E_API_URL ?? "http://localhost:4000";
export const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? "dev-only-admin-token-change-me";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_TOKEN}`, ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export interface SeededPilot {
  pilotId: string;
  participantId: string;
  rawInvitationToken: string;
}

/** Creates, provisions, and issues one invitation for a fresh pilot via the API directly (not through the admin UI) — used to set up the participant-flow e2e test's starting state. */
export async function seedPilotWithInvitation(): Promise<SeededPilot> {
  const pilot = await apiFetch("/pilots", {
    method: "POST",
    body: JSON.stringify({
      productKey: "forgeflow",
      productVersion: "0.1.0-demo",
      templateKey: "e2e-template",
      organization: { name: "E2E Test Org", primaryContactEmail: "e2e@example.com" },
      name: `E2E Pilot ${Date.now()}`,
      environmentTypeKey: "sandbox",
      featureKeys: ["order_routing", "kds_stations"],
      participants: [{ email: `e2e-${Date.now()}@example.com`, role: "primary_contact" }],
    }),
  });

  await apiFetch(`/pilots/${pilot.id}/provision`, { method: "POST", body: JSON.stringify({}) });

  const invitation = await apiFetch(`/pilots/${pilot.id}/invitations`, {
    method: "POST",
    body: JSON.stringify({ participantId: pilot.participants[0].id, expiresInHours: 168 }),
  });

  return { pilotId: pilot.id, participantId: pilot.participants[0].id, rawInvitationToken: invitation.rawToken };
}
