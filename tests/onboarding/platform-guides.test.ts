import assert from "node:assert/strict";
import test from "node:test";

import { PLATFORMS } from "@/lib/onboarding/model";
import {
  PLATFORM_GUIDES,
  RATE_TYPE_LABEL,
  isSocialPlatform,
  platformFilterHref,
  ratePlatformLabel,
} from "@/lib/platforms/guides";

test("each network has a posting brief without an em dash", () => {
  for (const platform of PLATFORMS) {
    const guide = PLATFORM_GUIDES[platform];
    assert.equal(isSocialPlatform(platform), true);
    assert.ok(guide.label.length > 0);
    assert.ok(guide.mark.length > 0);
    assert.ok(guide.frame.length > 0);
    assert.ok(guide.length.length > 0);
    assert.ok(guide.hook.length > 0);
    assert.ok(guide.caption.length > 0);
    assert.ok(guide.submit.length > 0);
    const copy = `${guide.surface} ${guide.frame} ${guide.length} ${guide.hook} ${guide.caption} ${guide.submit}`;
    assert.equal(copy.includes("—"), false);
    assert.equal(copy.includes("–"), false);
  }
  assert.equal(isSocialPlatform("facebook"), true);
  assert.equal(PLATFORM_GUIDES.facebook.label, "Facebook");
});

test("switching network keeps the other discover filters", () => {
  const href = platformFilterHref("/campaigns", {
    q: "fweta",
    country: "NA",
    platform: "tiktok",
    minRate: "10",
  }, "youtube");
  const url = new URL(href, "https://app.fweta.com");
  assert.equal(url.pathname, "/campaigns");
  assert.equal(url.searchParams.get("q"), "fweta");
  assert.equal(url.searchParams.get("country"), "NA");
  assert.equal(url.searchParams.get("minRate"), "10");
  assert.equal(url.searchParams.get("platform"), "youtube");
  assert.equal(platformFilterHref("/campaigns", { q: "fweta" }, ""), "/campaigns?q=fweta");
});

test("rate labels stay readable", () => {
  assert.equal(ratePlatformLabel("multi"), "Any platform");
  assert.equal(ratePlatformLabel("instagram"), "Instagram");
  assert.equal(RATE_TYPE_LABEL.per_1k_views, "Per 1,000 views");
  assert.equal(RATE_TYPE_LABEL.ugc_flat, "UGC flat fee");
});
