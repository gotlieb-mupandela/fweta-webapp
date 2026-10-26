import assert from "node:assert/strict";
import test from "node:test";

import { appUrl } from "../../lib/email/config";

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) previous.set(key, process.env[key]);
  try {
    for (const [key, value] of Object.entries(values)) setEnv(key, value);
    fn();
  } finally {
    for (const [key, value] of previous) setEnv(key, value);
  }
}

test("appUrl uses localhost in development and tests when unset", () => {
  withEnv({ NODE_ENV: "development", VERCEL_ENV: undefined, NEXT_PUBLIC_APP_URL: undefined }, () => {
    assert.equal(appUrl(), "http://localhost:3000");
  });
  withEnv({ NODE_ENV: "test", VERCEL_ENV: undefined, NEXT_PUBLIC_APP_URL: undefined }, () => {
    assert.equal(appUrl(), "http://localhost:3000");
  });
  withEnv(
    { NODE_ENV: "development", VERCEL_ENV: undefined, NEXT_PUBLIC_APP_URL: "https://app.fweta.com/" },
    () => {
      assert.equal(appUrl(), "https://app.fweta.com");
    },
  );
});

test("appUrl throws in production when NEXT_PUBLIC_APP_URL is unset, except Vercel preview", () => {
  withEnv({ NODE_ENV: "production", VERCEL_ENV: undefined, NEXT_PUBLIC_APP_URL: undefined }, () => {
    assert.throws(() => appUrl(), /NEXT_PUBLIC_APP_URL/);
  });
  withEnv({ NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: undefined }, () => {
    assert.throws(() => appUrl(), /NEXT_PUBLIC_APP_URL/);
  });
  withEnv({ NODE_ENV: "production", VERCEL_ENV: "preview", NEXT_PUBLIC_APP_URL: undefined }, () => {
    assert.equal(appUrl(), "http://localhost:3000");
  });
  withEnv(
    { NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://app.fweta.com/" },
    () => {
      assert.equal(appUrl(), "https://app.fweta.com");
    },
  );
});
