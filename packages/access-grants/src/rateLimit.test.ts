import { describe, expect, it } from "vitest";
import { SlidingWindowRateLimiter } from "./rateLimit.js";

describe("SlidingWindowRateLimiter", () => {
  it("allows up to maxHits within the window, then denies", () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter(3, 1000, () => now);

    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(true);
    const fourth = limiter.check("k");
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets once the window slides past the earliest hit", () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter(1, 100, () => now);
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(false);
    now = 101;
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("tracks separate keys independently", () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter(1, 1000, () => now);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });
});
