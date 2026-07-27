import { beforeEach, describe, expect, it } from "vitest";
import { generateRawToken, hashToken, hashIp, timingSafeEqualString } from "./crypto.js";

beforeEach(() => {
  process.env.TOKEN_PEPPER = "unit-test-pepper-please-ignore";
});

describe("generateRawToken", () => {
  it("produces high-entropy, URL-safe, non-repeating tokens", () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hashToken", () => {
  it("is deterministic for the same token + pepper", () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).toEqual(hashToken(raw));
  });

  it("differs for different tokens", () => {
    expect(hashToken(generateRawToken())).not.toEqual(hashToken(generateRawToken()));
  });

  it("differs when the pepper changes (rotation invalidates old hashes)", () => {
    const raw = generateRawToken();
    const hashA = hashToken(raw, "pepper-one-1234567890");
    const hashB = hashToken(raw, "pepper-two-1234567890");
    expect(hashA).not.toEqual(hashB);
  });

  it("throws if no pepper is configured", () => {
    delete process.env.TOKEN_PEPPER;
    expect(() => hashToken("whatever")).toThrow(/TOKEN_PEPPER/);
  });

  it("never leaks the raw token as a substring of the stored hash", () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).not.toContain(raw);
  });
});

describe("timingSafeEqualString", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeEqualString("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqualString("abc123", "abc124")).toBe(false);
  });

  it("returns false for different-length strings without throwing", () => {
    expect(timingSafeEqualString("short", "a-lot-longer")).toBe(false);
  });
});

describe("hashIp", () => {
  it("never stores the raw IP", () => {
    const hashed = hashIp("203.0.113.42");
    expect(hashed).not.toContain("203.0.113.42");
  });
});
