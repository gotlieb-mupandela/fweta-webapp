import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The CSS minifier keeps only -webkit-backdrop-filter, which Chrome ignores, so
// page text showed through the sticky public header on mobile. Keep it near opaque.
test("public sticky header background is near opaque", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const block = css.slice(css.indexOf(".public-header {"), css.indexOf("}", css.indexOf(".public-header {")));
  const pct = Number(block.match(/#ffffff (\d+)%/)?.[1] ?? 0);
  assert.ok(pct >= 95, `header white is ${pct}%`);
});

test("mobile tab bar background is near opaque", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const start = css.indexOf(".mobile-tab-bar {");
  const block = css.slice(start, css.indexOf("}", start));
  const pct = Number(block.match(/#ffffff (\d+)%/)?.[1] ?? 0);
  assert.ok(pct >= 95, `tab bar white is ${pct}%`);
});
