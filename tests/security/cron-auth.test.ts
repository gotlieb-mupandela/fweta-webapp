import assert from "node:assert/strict";
import test from "node:test";

import { authorizeCron } from "../../lib/security/cron";
import { readRepo } from "./scan-actions";

function request(authorization: string | null) {
  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "authorization" ? authorization : null;
      },
    },
  };
}

test("cron routes fail closed when CRON_SECRET is missing", () => {
  const env = process.env as Record<string, string | undefined>;
  const previousSecret = env.CRON_SECRET;
  const previousNodeEnv = env.NODE_ENV;
  try {
    delete env.CRON_SECRET;
    for (const nodeEnv of ["development", "test", "production"]) {
      env.NODE_ENV = nodeEnv;
      assert.equal(authorizeCron(request(null)), false, nodeEnv);
      assert.equal(authorizeCron(request("Bearer preview")), false, nodeEnv);
    }
    env.CRON_SECRET = "cron-test-secret";
    assert.equal(authorizeCron(request("Bearer cron-test-secret")), true);
    assert.equal(authorizeCron(request("Bearer wrong")), false);
    assert.equal(authorizeCron(request("cron-test-secret")), false);
  } finally {
    if (previousSecret == null) delete env.CRON_SECRET;
    else env.CRON_SECRET = previousSecret;
    if (previousNodeEnv == null) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
  }
});

test("job routes use the shared fail-closed check", () => {
  for (const relative of [
    "app/api/jobs/settle-rewards/route.ts",
    "app/api/jobs/housekeeping/route.ts",
    "app/api/jobs/poll-views/route.ts",
  ]) {
    const source = readRepo(relative);
    assert.match(source, /authorizeCron/);
    assert.equal(source.includes("if (!secret) return process.env.NODE_ENV"), false, relative);
  }
});
