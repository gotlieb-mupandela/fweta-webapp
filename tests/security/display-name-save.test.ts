import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { cleanDisplayName } from "../../lib/text/display-name";

test("markup is stripped from names", () => {
  assert.equal(cleanDisplayName("<b>Bold</b> Brand"), "Bold Brand");
  assert.equal(cleanDisplayName("<script>alert(1)</script>Ana"), "alert(1) Ana");
  assert.equal(cleanDisplayName("a > b < c"), "a b c");
  assert.equal(cleanDisplayName("Lina Andreas"), "Lina Andreas");
});

test("server save paths clean names before storing them", () => {
  const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  assert.match(read("app/actions/settings.ts"), /p\.displayName = displayName;/);
  assert.match(read("app/actions/settings.ts"), /cleanDisplayName\(parsed\.data\.displayName\)/);
  assert.match(read("app/actions/influencer.ts"), /displayName: cleanName,/);
  assert.equal(read("app/actions/influencer.ts").includes("displayName: parsed.data.displayName"), false);
  assert.match(read("lib/auth/session.ts"), /cleanDisplayName\(input\.displayName/);
  const onboarding = read("app/actions/onboarding.ts");
  assert.match(onboarding, /cleanDisplayName\(patch\.firstName\)/);
  assert.match(onboarding, /cleanDisplayName\(data\.companyName/);
});
