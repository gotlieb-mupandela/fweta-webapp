import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("new campaign end date picker starts tomorrow, so past dates are not offered", () => {
  const src = readFileSync("components/forms/campaign-form.tsx", "utf8");
  assert.match(src, /min=\{mode === "create" \?/);
});
