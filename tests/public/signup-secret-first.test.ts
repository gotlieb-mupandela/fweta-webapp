import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A missing AUTH_SECRET used to fail after the profile was written, leaving an orphan account.
test("signup checks the session secret before writing the profile", () => {
  const src = readFileSync("lib/auth/session.ts", "utf8");
  const body = src.slice(src.indexOf("export async function signup("));
  const check = body.indexOf("getAuthSecretKey()");
  const write = body.indexOf("updateStore(");
  assert.ok(check > 0, "secret check present");
  assert.ok(write > 0, "store write present");
  assert.ok(check < write, "secret checked before the store write");
  assert.ok(check < body.indexOf("readStore()"), "secret checked before reading the store");
});
