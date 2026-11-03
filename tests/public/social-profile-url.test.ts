import assert from "node:assert/strict";
import test from "node:test";

import { htmlLooksLikeErrorPage } from "@/lib/onboarding/profile-html";
import { publicProfileUrl, sanitizeHandle } from "@/lib/onboarding/model";
import { profileUrl } from "@/lib/social/platforms";
import { displaySocialUrl, normalizeSocialProfileUrl } from "@/lib/social/profile-url";
import { influencerProfileSchema } from "@/lib/validations/influencer";

const ERROR_PAGE =
  "error.  The requested URL /?utm_source=ig&utm_medium=social&utm_content=link_in_bio was not found on this server. That’s all we know";

test("normalises a bare handle, an @handle, and a full profile URL", () => {
  assert.deepEqual(normalizeSocialProfileUrl("instagram", "backie"), {
    ok: true,
    handle: "backie",
    url: "https://www.instagram.com/backie",
  });
  assert.deepEqual(normalizeSocialProfileUrl("tiktok", "@backie"), {
    ok: true,
    handle: "backie",
    url: "https://www.tiktok.com/@backie",
  });
  assert.deepEqual(
    normalizeSocialProfileUrl(
      "instagram",
      "https://www.instagram.com/backie/?utm_source=ig&utm_medium=social&utm_content=link_in_bio",
    ),
    { ok: true, handle: "backie", url: "https://www.instagram.com/backie" },
  );
  const facebook = normalizeSocialProfileUrl("facebook", "www.facebook.com/my.page");
  assert.equal(facebook.ok, true);
  if (facebook.ok) assert.equal(facebook.url, "https://www.facebook.com/my.page");
  const x = normalizeSocialProfileUrl("x", "@WindhoekClips");
  assert.equal(x.ok, true);
  if (x.ok) assert.equal(x.url, "https://x.com/WindhoekClips");
  const blank = normalizeSocialProfileUrl("tiktok", "  ");
  assert.equal(blank.ok, true);
  if (blank.ok) assert.equal(blank.url, "");
});

test("unwraps a doubled TikTok host instead of saving it", () => {
  for (const raw of [
    "https://www.tiktok.com/@tiktok.com/@backie",
    "tiktok.com/@backie",
    "@tiktok.com/@backie",
    "https://www.tiktok.com/@tiktok.com/@backie?lang=en",
  ]) {
    const parsed = normalizeSocialProfileUrl("tiktok", raw);
    assert.equal(parsed.ok, true, raw);
    if (parsed.ok) assert.equal(parsed.url, "https://www.tiktok.com/@backie");
  }
  assert.equal(profileUrl("tiktok", "https://www.tiktok.com/@tiktok.com/@backie"), "https://www.tiktok.com/@backie");
  assert.equal(sanitizeHandle("https://www.tiktok.com/@tiktok.com/@backie"), "backie");
});

test("rejects error page text, spaces, and non-profile links", () => {
  for (const platform of ["instagram", "facebook"] as const) {
    const sentence = normalizeSocialProfileUrl(platform, ERROR_PAGE);
    assert.equal(sentence.ok, false);
    if (!sentence.ok) assert.match(sentence.message, /error page/);

    const stored = normalizeSocialProfileUrl(platform, `https://www.${platform}.com/${ERROR_PAGE}`);
    assert.equal(stored.ok, false);
    if (!stored.ok) assert.match(stored.message, /error page/);
    assert.equal(displaySocialUrl(platform, `https://www.${platform}.com/${ERROR_PAGE}`), "");
    assert.equal(profileUrl(platform, ERROR_PAGE), "");
  }

  const encoded =
    "https://www.instagram.com/error.%20%20The%20requested%20URL%20/?utm_source=ig&utm_medium=social&utm_content=link_in_bio";
  assert.equal(normalizeSocialProfileUrl("instagram", encoded).ok, false);

  const spaced = normalizeSocialProfileUrl("facebook", "First Last");
  assert.equal(spaced.ok, false);
  if (!spaced.ok) assert.match(spaced.message, /spaces/);

  const reel = normalizeSocialProfileUrl("instagram", "https://www.instagram.com/reel/abc123");
  assert.equal(reel.ok, false);
  if (!reel.ok) assert.match(reel.message, /post link/);

  const video = normalizeSocialProfileUrl("tiktok", "https://www.tiktok.com/@backie/video/123");
  assert.equal(video.ok, false);

  const foreign = normalizeSocialProfileUrl("instagram", "https://evil.example/backie");
  assert.equal(foreign.ok, false);
  if (!foreign.ok) assert.match(foreign.message, /not an Instagram profile/);

  assert.equal(sanitizeHandle(ERROR_PAGE), null);
  assert.equal(sanitizeHandle("bad handle"), null);
  assert.equal(publicProfileUrl("instagram", "https://www.instagram.com/desert/"), "https://www.instagram.com/desert");
});

test("keeps a Facebook profile id and strips tracking params", () => {
  assert.deepEqual(
    normalizeSocialProfileUrl(
      "facebook",
      "https://www.facebook.com/profile.php?id=100063999&utm_source=ig&utm_medium=social",
    ),
    {
      ok: true,
      handle: "100063999",
      url: "https://www.facebook.com/profile.php?id=100063999",
    },
  );
});

test("profile save schema rejects error text and accepts a real profile link", () => {
  const base = {
    displayName: "Studio Name",
    headline: "Short form creator",
    bio: "Posts from Windhoek for local brands.",
    niche: "Lifestyle",
    location: "Windhoek",
    published: false,
  };
  const bad = influencerProfileSchema.safeParse({
    ...base,
    socials: { instagram: `https://www.instagram.com/${ERROR_PAGE}`, tiktok: "https://www.tiktok.com/@backie" },
  });
  assert.equal(bad.success, false);
  if (!bad.success) assert.match(bad.error.issues[0]?.message ?? "", /error page/);

  const good = influencerProfileSchema.safeParse({
    ...base,
    socials: {
      tiktok: "https://www.tiktok.com/@tiktok.com/@backie",
      instagram: "@backie",
      facebook: "",
    },
  });
  assert.equal(good.success, true);
});

test("an error page body is not treated as a profile", () => {
  const html = `<html><title>Error 404 (Not Found)!!1</title><p><b>404.</b> <ins>That’s an error.</ins>
  <p>The requested URL <code>/?utm_source=ig&amp;utm_medium=social&amp;utm_content=link_in_bio</code> was not found on this server. <ins>That’s all we know.</ins>`;
  assert.equal(htmlLooksLikeErrorPage(html), true);
  assert.equal(htmlLooksLikeErrorPage("<html><title>@backie</title><p>creator</p>"), false);
});
