import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// On a 390px phone the wrapped public header is about 150px tall. Sticky there
// covered a fifth of the screen, so it only sticks from the md breakpoint up.
test("public header sticks only from md up", () => {
  const src = readFileSync("components/public-chrome.tsx", "utf8");
  assert.match(src, /public-header relative top-0 z-40 md:sticky/);
});
