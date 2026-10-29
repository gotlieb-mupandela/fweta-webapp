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

// Admin user page linked hidden test profiles to a 404.
test("admin user page only links to the public profile when it is live", () => {
  const page = readFileSync("app/dashboard/admin/users/[id]/page.tsx", "utf8");
  assert.match(page, /isPublicInfluencerSlug\(/);
  assert.match(page, /isPublic=\{isPublic\}/);
  const comp = readFileSync("components/admin/admin-user-profile.tsx", "utf8");
  assert.match(comp, /isPublic \? \(/);
});
