import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// "View public profile" linked to a 404 when the profile was hidden from the public list.
test("influencer dashboard only links to the public profile when it is live", () => {
  for (const f of ["app/dashboard/influencer/rate-cards/page.tsx", "app/dashboard/influencer/bookings/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /isPublicInfluencerSlug\(/, f);
    assert.match(src, /isPublic \?/, f);
  }
  assert.match(readFileSync("lib/influencers/public.ts", "utf8"), /export async function isPublicInfluencerSlug/);
});
