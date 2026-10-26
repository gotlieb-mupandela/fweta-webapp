import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { safeBearerEqual } from "../../lib/security/bearer";
import { authorizeCron } from "../../lib/security/cron";

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) previous.set(key, process.env[key]);
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const request = (authorization: string | null) => ({
  headers: { get: (name: string) => (name.toLowerCase() === "authorization" ? authorization : null) },
});

test("bearer compare hashes both sides before timingSafeEqual", () => {
  const source = readFileSync(new URL("../../lib/security/bearer.ts", import.meta.url), "utf8");
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /timingSafeEqual/);
  assert.equal(source.includes("actual.length"), false);

  assert.equal(safeBearerEqual("Bearer correct-secret", "correct-secret"), true);
  assert.equal(safeBearerEqual("Bearer wrong", "correct-secret"), false);
  assert.equal(safeBearerEqual("Bearer correct-secret-and-then-some", "correct-secret"), false);
  assert.equal(safeBearerEqual(null, "correct-secret"), false);
  assert.equal(safeBearerEqual("x", "a-much-longer-secret-value"), false);
});

test("cron auth fails closed when the secret is unset in production or on Vercel", () => {
  withEnv(
    { NODE_ENV: "production", CRON_SECRET: undefined, VERCEL: undefined, VERCEL_ENV: undefined },
    () => {
      assert.equal(authorizeCron(request("Bearer anything")), false);
      assert.equal(authorizeCron(request(null)), false);
    },
  );

  withEnv(
    { NODE_ENV: "development", VERCEL_ENV: "preview", VERCEL: "1", CRON_SECRET: undefined },
    () => {
      assert.equal(authorizeCron(request(null)), false);
    },
  );

  withEnv(
    { NODE_ENV: "development", VERCEL: undefined, VERCEL_ENV: undefined, CRON_SECRET: undefined },
    () => {
      assert.equal(authorizeCron(request(null)), true);
    },
  );

  withEnv(
    {
      NODE_ENV: "production",
      VERCEL: undefined,
      VERCEL_ENV: undefined,
      CRON_SECRET: "cron-secret-value",
    },
    () => {
      assert.equal(authorizeCron(request("Bearer cron-secret-value")), true);
      assert.equal(authorizeCron(request("Bearer other")), false);
      assert.equal(authorizeCron(request("Bearer cron-secret-value-extra")), false);
      assert.equal(authorizeCron(request(null)), false);
    },
  );
});

test("settle-rewards uses the shared cron check", () => {
  const source = readFileSync(new URL("../../app/api/jobs/settle-rewards/route.ts", import.meta.url), "utf8");
  assert.match(source, /authorizeCron/);
  assert.equal(source.includes("Bearer ${"), false);
});
