import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveStoreDataDir } from "../../lib/db/store";

test("FWETA_DATA_DIR is ignored in production and kept in development and tests", () => {
  const override = "/tmp/fweta-data-override";

  assert.equal(
    resolveStoreDataDir({ NODE_ENV: "production", FWETA_DATA_DIR: override }),
    path.join(process.cwd(), "data"),
  );
  assert.equal(
    resolveStoreDataDir({ NODE_ENV: "production", FWETA_DATA_DIR: override, VERCEL: "1" }),
    path.join("/tmp", "fweta-data"),
  );
  assert.equal(
    resolveStoreDataDir({
      NODE_ENV: "production",
      FWETA_DATA_DIR: override,
      AWS_LAMBDA_FUNCTION_NAME: "fn",
    }),
    path.join("/tmp", "fweta-data"),
  );

  assert.equal(resolveStoreDataDir({ NODE_ENV: "development", FWETA_DATA_DIR: override }), path.resolve(override));
  assert.equal(
    resolveStoreDataDir({ NODE_ENV: "test", FWETA_DATA_DIR: override, VERCEL: "1" }),
    path.resolve(override),
  );
  assert.equal(resolveStoreDataDir({ NODE_ENV: "development", FWETA_DATA_DIR: "  " }), path.join(process.cwd(), "data"));
  assert.equal(resolveStoreDataDir({ NODE_ENV: "development" }), path.join(process.cwd(), "data"));
});
