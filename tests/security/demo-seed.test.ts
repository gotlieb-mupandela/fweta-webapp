import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { demoEmailsToSeed, seedDemoAccounts, shouldSeedDemoAccounts } from "../../lib/auth/demo-seed";

const dev = { NODE_ENV: "development", VERCEL_ENV: undefined, FWETA_SEED_DEMO: undefined };

test("demo seeding is off by default", () => {
  assert.equal(shouldSeedDemoAccounts({ ...dev }), false);
  assert.equal(shouldSeedDemoAccounts({ NODE_ENV: "development" }), false);
  assert.equal(shouldSeedDemoAccounts({ FWETA_SEED_DEMO: "1", NODE_ENV: "development" }), false);
  assert.equal(shouldSeedDemoAccounts({ FWETA_SEED_DEMO: "TRUE", NODE_ENV: "development" }), false);
  assert.deepEqual(demoEmailsToSeed([], dev), []);
});

test("demo seeding stays off in production even when the flag is true", () => {
  assert.equal(
    shouldSeedDemoAccounts({ FWETA_SEED_DEMO: "true", NODE_ENV: "production" }),
    false,
  );
  assert.equal(
    shouldSeedDemoAccounts({
      FWETA_SEED_DEMO: "true",
      NODE_ENV: "development",
      VERCEL_ENV: "production",
    }),
    false,
  );
  assert.equal(
    shouldSeedDemoAccounts({
      FWETA_SEED_DEMO: "true",
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    }),
    false,
  );
  assert.deepEqual(
    demoEmailsToSeed([], { FWETA_SEED_DEMO: "true", NODE_ENV: "production" }),
    [],
  );
});

test("demo seeding is on only with the flag in development", () => {
  const env = { FWETA_SEED_DEMO: "true", NODE_ENV: "development" };
  assert.equal(shouldSeedDemoAccounts(env), true);
  assert.deepEqual(demoEmailsToSeed([], env), [
    "brand@fweta.test",
    "creator@fweta.test",
    "clipper@fweta.test",
  ]);
  assert.deepEqual(demoEmailsToSeed(["brand@fweta.test"], env), [
    "creator@fweta.test",
    "clipper@fweta.test",
  ]);
});

test("demo seeding is not invoked from login or the login action", async () => {
  const login = readFileSync(new URL("../../app/login/page.tsx", import.meta.url), "utf8");
  const action = readFileSync(new URL("../../app/actions/auth.ts", import.meta.url), "utf8");
  assert.equal(login.includes("seedDemoAccounts"), false);
  assert.equal(action.includes("seedDemoAccounts"), false);
  const previous = process.env.FWETA_SEED_DEMO;
  delete process.env.FWETA_SEED_DEMO;
  try {
    const result = await seedDemoAccounts();
    assert.deepEqual(result, { seeded: false });
  } finally {
    if (previous === undefined) delete process.env.FWETA_SEED_DEMO;
    else process.env.FWETA_SEED_DEMO = previous;
  }
});
