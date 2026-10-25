import assert from "node:assert/strict";
import test from "node:test";

import { activeStoreDriver } from "../../lib/db/adapter";

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

const supabaseOff = {
  NEXT_PUBLIC_SUPABASE_URL: undefined,
  SUPABASE_URL: undefined,
  SUPABASE_SECRET_KEY: undefined,
  SUPABASE_SERVICE_ROLE_KEY: undefined,
  FWETA_STORE: undefined,
  VERCEL: undefined,
  VERCEL_ENV: undefined,
  NEXT_PHASE: undefined,
};

test("production refuses the file store, development allows it, and the build phase does not throw", () => {
  withEnv({ ...supabaseOff, NODE_ENV: "production" }, () => {
    assert.throws(() => activeStoreDriver(), /Refusing the local file store in production/);
  });

  withEnv({ ...supabaseOff, NODE_ENV: "production", FWETA_STORE: "file" }, () => {
    assert.throws(() => activeStoreDriver(), /Refusing the local file store in production/);
  });

  withEnv({ ...supabaseOff, NODE_ENV: "development", VERCEL: "1" }, () => {
    assert.throws(() => activeStoreDriver(), /Refusing the local file store in production/);
  });

  withEnv({ ...supabaseOff, NODE_ENV: "development" }, () => {
    assert.doesNotThrow(() => activeStoreDriver());
    assert.equal(activeStoreDriver(), "file");
  });

  withEnv({ ...supabaseOff, NODE_ENV: "test", FWETA_STORE: "file" }, () => {
    assert.equal(activeStoreDriver(), "file");
  });

  withEnv(
    {
      ...supabaseOff,
      NODE_ENV: "production",
      VERCEL: "1",
      NEXT_PHASE: "phase-production-build",
      FWETA_STORE: "file",
    },
    () => {
      assert.doesNotThrow(() => activeStoreDriver());
      assert.equal(activeStoreDriver(), "file");
    },
  );

  withEnv(
    {
      ...supabaseOff,
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    },
    () => {
      assert.equal(activeStoreDriver(), "supabase");
    },
  );
});
