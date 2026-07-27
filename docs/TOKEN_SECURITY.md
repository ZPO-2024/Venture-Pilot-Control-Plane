# Token Security

Implementation: `packages/access-grants`.

## Token generation and storage

- Raw tokens (invitations and sessions) are `crypto.randomBytes(32)`,
  base64url-encoded — 256 bits of entropy, single-purpose, one per
  invitation/session.
- Only an **HMAC-SHA256 hash** of the raw token is ever stored
  (`Invitation.tokenHash`, `Session.tokenHash`), keyed with a server-side
  `TOKEN_PEPPER` secret (`packages/access-grants/src/crypto.ts`).
- We deliberately do **not** use a slow password KDF (bcrypt/argon2) here —
  those exist to slow down brute-forcing *low*-entropy human passwords.
  These tokens already carry 256 bits of entropy; HMAC-SHA256 with a pepper
  is the correct, standard tool, and it's Node's built-in `crypto` module —
  no homegrown cryptographic primitives anywhere in this codebase.
- The raw token is shown to the caller **exactly once**: invitation
  creation returns it in the HTTP response body and it is never persisted
  or logged again; redemption similarly returns a raw session token once.
- Rotating `TOKEN_PEPPER` invalidates every outstanding invitation and
  session hash at once — a documented, deliberate "kill everything" lever.

## One-time invitation redemption

`redeemInvitation` (`packages/access-grants/src/invitations.ts`) claims an
invitation via a single conditional `UPDATE ... WHERE id = $1 AND status =
'pending' AND expires_at > now()`. Only one concurrent/repeat redemption
attempt can win that row lock; every other attempt affects zero rows and
fails closed with `InvitationAlreadyRedeemedError` or
`InvitationExpiredError`. This is what the "reused invitation" security
test exercises directly.

## Session validation — no trust in cached state

Participant sessions are **opaque, server-side, bearer tokens** — not
JWTs. `validateSession` re-reads Postgres on every single call and checks,
in order: session exists → not revoked → not expired → access grant is
`active` and unexpired → pilot status is in
`packages/shared/src/lifecycle.ts`'s `ACCESS_PERMITTED_STATES` → pilot
`expiresAt` hasn't passed. There is no client-held claim (JWT or
otherwise) that could go stale — this is structurally why "expired pilot
rejected even with a cached session" holds even if a client never refreshes
its local state.

## Revocation

- `revokeAccessGrant` revokes one grant and its sessions and writes an
  `AuditEvent`.
- `revokeAllForPilot` bulk-revokes every active grant and session for a
  pilot in one transaction step — this is what `POST /pilots/:id/revoke`
  calls, satisfying "admin can end all sessions for a pilot at once."

## Rate limiting

`SlidingWindowRateLimiter` is an in-memory, per-process sliding window,
applied (in `apps/api`) to `POST /invitations/:token/redeem` and the admin
auth check. **This is a placeholder** — it does not hold a limit across
multiple processes or replicas. Before this system is ever pointed at
non-local traffic, replace it with a shared store (Redis, or Postgres-backed
counters) behind the same `check(key)` interface.

## Log redaction

`packages/access-grants/src/logRedaction.ts` exports the pino `redact`
path list wired into `apps/api`'s logger at bootstrap
(`Authorization`/cookie headers, any `token`/`rawToken`/`tokenHash` body or
param field). This is verified by an actual test
(`tests/security/token-not-in-logs.test.ts`) that drives a real invitation
redemption through a pino instance writing to an in-memory buffer and
asserts the raw token substring never appears in any emitted log line —
not just that the redaction config exists.

## Admin authentication (current MVP)

The admin cockpit authenticates with a single shared-secret bearer token
(`ADMIN_API_TOKEN`), compared with `timingSafeEqualString` (constant-time,
so response timing doesn't leak a partial match). **This is explicitly a
placeholder** for a single-operator local/demo deployment — there is no
multi-admin RBAC, no SSO, and no per-admin audit identity beyond the
literal string "admin". Before this is used by more than one operator or
pointed at anything beyond local trials, replace it with real
authentication (e.g. an OIDC provider) feeding distinct admin actor IDs
into the same `Actor` type already threaded through every audited
mutation.

## What is explicitly not built here

- No password storage of any kind (there are no user passwords in this
  system — only high-entropy tokens).
- No distributed session cache — every validation is a live Postgres read,
  by design, to keep expiration/revocation enforcement airtight.
- No token refresh flow — sessions are bounded by the pilot's `expiresAt`
  and re-issued only via invitation redemption or admin-driven extension.
