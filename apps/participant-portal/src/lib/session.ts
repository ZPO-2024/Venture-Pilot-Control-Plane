const STORAGE_KEY = "vpcp_participant_session";

export function getSessionToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setSessionToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearSessionToken(): void {
  localStorage.removeItem(STORAGE_KEY);
}
