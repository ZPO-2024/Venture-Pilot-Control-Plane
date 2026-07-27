// In-memory sliding-window rate limiter. Fine for a single-process local
// demo/trial deployment; document as a placeholder before any multi-process
// or real deployment (see docs/TOKEN_SECURITY.md) — a real deployment needs
// a shared store (e.g. Redis) so limits hold across processes/replicas.

interface Bucket {
  hits: number[];
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Returns { allowed: true } or { allowed: false, retryAfterMs } without mutating state on denial's boundary edge. */
  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = this.now();
    const windowStart = now - this.windowMs;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { hits: [] };
      this.buckets.set(key, bucket);
    }
    bucket.hits = bucket.hits.filter((t) => t > windowStart);

    if (bucket.hits.length >= this.maxHits) {
      const oldest = bucket.hits[0]!;
      return { allowed: false, retryAfterMs: oldest + this.windowMs - now };
    }

    bucket.hits.push(now);
    return { allowed: true, retryAfterMs: 0 };
  }

  reset(key?: string): void {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }
}
