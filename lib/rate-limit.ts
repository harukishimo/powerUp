type Bucket = { count: number; resetAt: number };

const state = globalThis as typeof globalThis & { __powerUpRateLimit?: Map<string, Bucket> };

export function consumeRateLimit(key: string, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  const buckets = state.__powerUpRateLimit ??= new Map();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit) return { allowed: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}
