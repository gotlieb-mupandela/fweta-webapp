type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

/**
 * Best-effort in-memory limiter. Each serverless instance has its own map,
 * so this slows bursts and credential stuffing on a warm instance. It is not
 * a global lock — put the same routes behind the Vercel firewall for that.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((stamp) => now - stamp < windowMs);
  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    buckets.set(key, bucket);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 5000) {
    const first = buckets.keys().next().value;
    if (first) buckets.delete(first);
  }
  return { ok: true };
}
