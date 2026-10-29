import { createHash } from "node:crypto";

import { updateStore } from "@/lib/db/store";
import type { RateLimitBucket } from "@/lib/db/types";
import { rateLimit } from "@/lib/security/rate-limit";

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

const MAX_BUCKETS = 2000;

export function hashRateKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/** Pure counter step. Drops expired hits and old buckets, then records this hit if allowed. */
export function applyRateLimit(
  buckets: RateLimitBucket[],
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): { buckets: RateLimitBucket[]; result: RateLimitResult } {
  const live = buckets
    .map((bucket) => ({ key: bucket.key, hits: bucket.hits.filter((at) => now - at < windowMs * 4 && at <= now) }))
    .filter((bucket) => bucket.hits.length > 0);
  let bucket = live.find((item) => item.key === key);
  if (!bucket) {
    bucket = { key, hits: [] };
    live.push(bucket);
  }
  const recent = bucket.hits.filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    const oldest = Math.min(...recent);
    return {
      buckets: live,
      result: { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) },
    };
  }
  bucket.hits = [...recent, now];
  const trimmed = live.length > MAX_BUCKETS ? live.slice(live.length - MAX_BUCKETS) : live;
  return { buckets: trimmed, result: { ok: true } };
}

/**
 * Rate limit shared by every instance: the counter lives in the store document
 * and is updated inside the compare-and-swap save. Use it only on low volume
 * routes (signup, password reset). If the store write fails, fall back to the
 * per-instance limiter instead of blocking the user.
 */
export async function sharedRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const hashed = hashRateKey(key);
  let result: RateLimitResult = { ok: true };
  try {
    await updateStore((store) => {
      const next = applyRateLimit(store.rateLimits ?? [], hashed, limit, windowMs, Date.now());
      store.rateLimits = next.buckets;
      result = next.result;
    });
    return result;
  } catch {
    return rateLimit(key, limit, windowMs);
  }
}
