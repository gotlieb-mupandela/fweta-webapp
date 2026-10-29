import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("signup role buttons expose their selected state to assistive tech", () => {
  const src = readFileSync("components/auth/signup-form.tsx", "utf8");
  assert.match(src, /aria-pressed=\{active\}/);
});
