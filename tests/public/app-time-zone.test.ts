import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { formatAppDate, formatAppDateTime } from "@/lib/format/time";

// Payout and admin times rendered in the server zone (UTC on Vercel).
test("app times render in Windhoek time, not UTC", () => {
  const out = formatAppDateTime("2026-10-29T22:30:00Z");
  assert.match(out, /30 Oct 2026/);
  assert.match(out, /00:30/);
  assert.equal(formatAppDate("2026-10-29T22:30:00Z").includes("30"), true);
});

test("payout and admin pages pass an explicit time zone", () => {
  const files = [
    "app/dashboard/admin/fees/page.tsx",
    "app/dashboard/admin/withdrawals/page.tsx",
    "app/dashboard/admin/bookings/page.tsx",
    "app/dashboard/admin/deposits/page.tsx",
    "app/dashboard/admin/fraud/page.tsx",
    "app/dashboard/admin/users/page.tsx",
    "app/dashboard/settings/withdraw/page.tsx",
    "components/admin/admin-user-profile.tsx",
    "components/rewards/clip-timeline.tsx",
    "components/forms/linked-account-form.tsx",
    "lib/rewards/content-rewards.ts",
  ];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /toLocaleString\(\)/, f);
    for (const m of src.matchAll(/toLocale(?:Date)?String\("en-NA",\s*\{[^}]*\}/g)) assert.match(m[0], /timeZone/, f);
  }
});
