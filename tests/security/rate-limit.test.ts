import assert from "node:assert/strict";
import test from "node:test";

import { pickClientIp } from "../../lib/security/client-ip";
import { applyRateLimit, hashRateKey } from "../../lib/security/shared-rate-limit";
import type { RateLimitBucket } from "../../lib/db/types";

const h = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

test("client IP prefers Vercel headers and ignores a spoofed X-Forwarded-For first hop", () => {
  assert.equal(
    pickClientIp(h({ "x-vercel-forwarded-for": "41.182.1.2", "x-forwarded-for": "1.1.1.1, 41.182.1.2" })),
    "41.182.1.2",
  );
  assert.equal(pickClientIp(h({ "x-real-ip": "41.182.1.3", "x-forwarded-for": "9.9.9.9" })), "41.182.1.3");
  assert.equal(pickClientIp(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.5" })), "10.0.0.5");
  assert.equal(pickClientIp(h({ "x-real-ip": "<script>" })), "local");
  assert.equal(pickClientIp(h({})), "local");
});

test("shared counter blocks after the limit and frees up after the window", () => {
  let buckets: RateLimitBucket[] = [];
  const key = hashRateKey("signup:41.182.1.2");
  const t = 1_000_000;
  for (let i = 0; i < 5; i += 1) {
    const step = applyRateLimit(buckets, key, 5, 60_000, t + i);
    assert.equal(step.result.ok, true);
    buckets = step.buckets;
  }
  const blocked = applyRateLimit(buckets, key, 5, 60_000, t + 10);
  assert.equal(blocked.result.ok, false);
  const other = applyRateLimit(blocked.buckets, hashRateKey("signup:41.182.9.9"), 5, 60_000, t + 10);
  assert.equal(other.result.ok, true);
  const later = applyRateLimit(other.buckets, key, 5, 60_000, t + 61_000);
  assert.equal(later.result.ok, true);
});

test("counters survive across instances because they live in the shared document", () => {
  // Two instances read and write the same bucket list (the store row).
  let shared: RateLimitBucket[] = [];
  const key = hashRateKey("password-reset:41.182.1.2");
  const results: boolean[] = [];
  for (let i = 0; i < 6; i += 1) {
    const step = applyRateLimit(shared, key, 5, 900_000, 5_000 + i);
    shared = step.buckets;
    results.push(step.result.ok);
  }
  assert.deepEqual(results, [true, true, true, true, true, false]);
  assert.equal(shared.some((bucket) => bucket.key.includes("41.182")), false);
});
