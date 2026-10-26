import assert from "node:assert/strict";
import test from "node:test";

import {
  assertHostedSecrets,
  getAuthSecret,
  getPayoutSecret,
  isHostedRuntime,
  readAuthSecretKey,
} from "../../lib/auth/secret";

const DEV_AUTH = "fweta-local-dev-secret-change-me";
const DEV_PAYOUT = "fweta-payout-key-change-me";
const AUTH = "a".repeat(40);
const PAYOUT = "b".repeat(40);

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

const hostedOff = {
  NODE_ENV: "development",
  VERCEL: undefined,
  VERCEL_ENV: undefined,
  NEXT_PHASE: undefined,
  AUTH_SECRET: undefined,
  PAYOUT_ENCRYPTION_KEY: undefined,
};

test("local dev keeps distinct dev keys and hosted runs refuse bad secrets", () => {
  withEnv(hostedOff, () => {
    assert.equal(isHostedRuntime(), false);
    assert.equal(getAuthSecret(), DEV_AUTH);
    assert.equal(getPayoutSecret(), DEV_PAYOUT);
    assert.notEqual(getPayoutSecret(), getAuthSecret());
    assert.ok(readAuthSecretKey());
    assert.doesNotThrow(() => assertHostedSecrets());
  });

  withEnv({ ...hostedOff, NODE_ENV: "production" }, () => {
    assert.throws(() => getAuthSecret(), /AUTH_SECRET is missing or still the public dev key/);
    assert.throws(() => getPayoutSecret(), /PAYOUT_ENCRYPTION_KEY is not set/);
    assert.equal(readAuthSecretKey(), null);
    assert.throws(() => assertHostedSecrets(), /AUTH_SECRET/);
  });

  withEnv({ ...hostedOff, NODE_ENV: "production", AUTH_SECRET: DEV_AUTH, PAYOUT_ENCRYPTION_KEY: PAYOUT }, () => {
    assert.throws(() => getAuthSecret(), /public dev key/);
  });

  withEnv({ ...hostedOff, NODE_ENV: "development", VERCEL_ENV: "preview" }, () => {
    assert.equal(isHostedRuntime(), true);
    assert.throws(() => getAuthSecret(), /AUTH_SECRET/);
    assert.throws(() => getPayoutSecret(), /PAYOUT_ENCRYPTION_KEY is not set/);
  });

  withEnv({ ...hostedOff, NODE_ENV: "development", VERCEL: "1", AUTH_SECRET: AUTH }, () => {
    assert.throws(() => getPayoutSecret(), /PAYOUT_ENCRYPTION_KEY is not set/);
  });

  withEnv(
    { ...hostedOff, NODE_ENV: "production", AUTH_SECRET: AUTH, PAYOUT_ENCRYPTION_KEY: "short" },
    () => {
      assert.throws(() => getPayoutSecret(), /too short/);
    },
  );

  withEnv(
    { ...hostedOff, NODE_ENV: "production", AUTH_SECRET: AUTH, PAYOUT_ENCRYPTION_KEY: AUTH },
    () => {
      assert.throws(() => getPayoutSecret(), /must not equal AUTH_SECRET/);
    },
  );

  withEnv(
    { ...hostedOff, NODE_ENV: "production", AUTH_SECRET: AUTH, PAYOUT_ENCRYPTION_KEY: DEV_PAYOUT },
    () => {
      assert.throws(() => getPayoutSecret(), /public dev key/);
    },
  );

  withEnv(
    {
      ...hostedOff,
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
      AUTH_SECRET: undefined,
      PAYOUT_ENCRYPTION_KEY: undefined,
    },
    () => {
      assert.equal(isHostedRuntime(), false);
      assert.doesNotThrow(() => assertHostedSecrets());
    },
  );

  withEnv(
    { ...hostedOff, NODE_ENV: "production", AUTH_SECRET: AUTH, PAYOUT_ENCRYPTION_KEY: PAYOUT },
    () => {
      assert.equal(getAuthSecret(), AUTH);
      assert.equal(getPayoutSecret(), PAYOUT);
      assert.doesNotThrow(() => assertHostedSecrets());
    },
  );
});
