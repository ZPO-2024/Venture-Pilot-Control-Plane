import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Node's built-in crypto only — no homegrown primitives. Tokens are
// high-entropy random values (not user passwords), so HMAC-SHA256 with a
// server-side pepper is the right tool for hashing them at rest: it's fast
// (no need for a slow KDF like bcrypt/argon2, which exist to slow down
// brute-forcing *low*-entropy secrets) and the pepper means a stolen DB
// alone can't be used to redeem tokens even via a precomputed table.

function getPepper(explicit?: string): string {
  const pepper = explicit ?? process.env.TOKEN_PEPPER;
  if (!pepper || pepper.length < 16) {
    throw new Error(
      "TOKEN_PEPPER is not set (or too short). Set a >=16 char random secret before issuing/validating tokens.",
    );
  }
  return pepper;
}

/** A raw, single-use, high-entropy token. Shown to the caller exactly once. */
export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Deterministic HMAC-SHA256 hash of a raw token, for storage/lookup. */
export function hashToken(rawToken: string, pepper?: string): string {
  return createHmac("sha256", getPepper(pepper)).update(rawToken, "utf8").digest("hex");
}

/** Constant-time string comparison, for comparing shared-secret admin tokens. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal-length buffers so the function's
    // timing doesn't leak the *correct* token's length either.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** One-way hash of a client IP for coarse audit/rate-limit use, never the raw IP. */
export function hashIp(ip: string, pepper?: string): string {
  return createHmac("sha256", getPepper(pepper)).update(ip, "utf8").digest("hex").slice(0, 32);
}
