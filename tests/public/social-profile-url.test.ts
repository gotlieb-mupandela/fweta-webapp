import assert from "node:assert/strict";
import test from "node:test";

import { htmlLooksLikeErrorPage } from "@/lib/onboarding/profile-html";
import { publicProfileUrl, sanitizeHandle } from "@/lib/onboarding/model";
import { profileUrl } from "@/lib/social/platforms";
import {
  displaySocialUrl,
  normalizeSocialProfileUrl,
  profileLookupMessage,
  socialLookupBlockedMessage,
  socialLookupNote,
} from "@/lib/social/profile-url";
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

test("rejects TikTok short links instead of guessing a handle", () => {
  for (const raw of [
    "https://vm.tiktok.com/ZMabcd123/",
    "http://vm.tiktok.com/ZMabcd123",
    "vm.tiktok.com/ZMabcd123/",
    "https://vt.tiktok.com/ZMabcd123/",
    "vt.tiktok.com/ZMabcd123",
  ]) {
    const parsed = normalizeSocialProfileUrl("tiktok", raw);
    assert.equal(parsed.ok, false, raw);
    if (!parsed.ok) {
      assert.match(parsed.message, /https:\/\/www\.tiktok\.com\/@handle/);
      assert.equal(parsed.message.includes("ZMabcd123"), false);
    }
    assert.equal(profileUrl("tiktok", raw), "");
    assert.equal(publicProfileUrl("tiktok", raw), null);
    assert.equal(sanitizeHandle(raw), null);
  }
});

test("accepts fb.me and mobile Facebook links typed without a scheme", () => {
  const cases = [
    ["https://fb.me/my.page", "https://www.facebook.com/my.page"],
    ["https://fb.me/my.page/", "https://www.facebook.com/my.page"],
    ["m.facebook.com/my.page", "https://www.facebook.com/my.page"],
    ["web.facebook.com/my.page", "https://www.facebook.com/my.page"],
    ["mbasic.facebook.com/my.page", "https://www.facebook.com/my.page"],
    ["m.facebook.com/profile.php?id=100063999", "https://www.facebook.com/profile.php?id=100063999"],
    ["web.facebook.com/profile.php?id=100063999&ref=bookmarks", "https://www.facebook.com/profile.php?id=100063999"],
    ["mbasic.facebook.com/profile.php?id=100063999", "https://www.facebook.com/profile.php?id=100063999"],
  ] as const;
  for (const [raw, url] of cases) {
    const parsed = normalizeSocialProfileUrl("facebook", raw);
    assert.equal(parsed.ok, true, raw);
    if (parsed.ok) assert.equal(parsed.url, url, raw);
    assert.equal(profileUrl("facebook", raw), url);
  }
});

test("accepts single handles that contain the word error", () => {
  for (const handle of ["mr.error", "error.fit"]) {
    for (const platform of ["tiktok", "instagram", "facebook", "youtube"] as const) {
      const parsed = normalizeSocialProfileUrl(platform, handle);
      assert.equal(parsed.ok, true, `${platform} ${handle}`);
      if (parsed.ok) {
        assert.equal(parsed.handle, handle);
        assert.equal(parsed.url, profileUrl(platform, handle));
      }
      assert.equal(sanitizeHandle(handle), handle);
    }
  }

  const withTracking = normalizeSocialProfileUrl(
    "instagram",
    "https://www.instagram.com/mr.error/?utm_source=ig&utm_medium=social&utm_content=link_in_bio",
  );
  assert.equal(withTracking.ok, true);
  if (withTracking.ok) assert.equal(withTracking.url, "https://www.instagram.com/mr.error");

  const newline = normalizeSocialProfileUrl("facebook", "error\nThe requested URL was not found on this server");
  assert.equal(newline.ok, false);
  if (!newline.ok) assert.match(newline.message, /error page/);

  const longText = `error.${"x".repeat(80)}`;
  const long = normalizeSocialProfileUrl("instagram", longText);
  assert.equal(long.ok, false);
  if (!long.ok) assert.match(long.message, /error page/);
  assert.equal(profileUrl("instagram", longText), "");
});

test("normalises YouTube channel tabs to the channel URL", () => {
  for (const raw of [
    "https://youtube.com/@name/videos",
    "https://www.youtube.com/@name/videos/",
    "https://www.youtube.com/@name/shorts",
    "https://youtube.com/@name/about",
    "https://www.youtube.com/@Name/streams?view=0",
  ]) {
    const parsed = normalizeSocialProfileUrl("youtube", raw);
    assert.equal(parsed.ok, true, raw);
    if (parsed.ok) {
      const handle = raw.includes("@Name") ? "Name" : "name";
      assert.equal(parsed.handle, handle);
      assert.equal(parsed.url, `https://www.youtube.com/@${handle}`);
    }
  }

  const channel = "UC1234567890123456789012";
  const withTab = normalizeSocialProfileUrl("youtube", `https://www.youtube.com/channel/${channel}/about`);
  assert.equal(withTab.ok, true);
  if (withTab.ok) assert.equal(withTab.url, `https://www.youtube.com/channel/${channel}`);

  const custom = normalizeSocialProfileUrl("youtube", "https://www.youtube.com/c/DesertClips/videos");
  assert.equal(custom.ok, true);
  if (custom.ok) assert.equal(custom.url, "https://www.youtube.com/@DesertClips");

  const shortsVideo = normalizeSocialProfileUrl("youtube", "https://www.youtube.com/shorts/abcdefghijk");
  assert.equal(shortsVideo.ok, false);
  if (!shortsVideo.ok) assert.match(shortsVideo.message, /post link/);
});

test("rejects Facebook sections that are not profiles", () => {
  for (const path of ["groups", "pages", "watch", "marketplace", "events", "gaming", "messages"]) {
    for (const raw of [`https://www.facebook.com/${path}`, `https://facebook.com/${path}/some-id`, `fb.me/${path}`, path]) {
      const parsed = normalizeSocialProfileUrl("facebook", raw);
      assert.equal(parsed.ok, false, raw);
      if (!parsed.ok) assert.match(parsed.message, /not a profile/);
      assert.equal(profileUrl("facebook", raw), "");
    }
  }

  const instagram = normalizeSocialProfileUrl("instagram", "groups");
  assert.equal(instagram.ok, true);
  if (instagram.ok) assert.equal(instagram.url, "https://www.instagram.com/groups");
});

test("shows the lookup note only after a failed lookup, not under a saved link", () => {
  const saved = "https://www.instagram.com/backie";
  assert.equal(
    socialLookupNote({
      platform: "instagram",
      attempted: true,
      failed: true,
      url: saved,
      savedUrl: saved,
    }),
    null,
  );
  assert.equal(
    socialLookupNote({
      platform: "instagram",
      attempted: false,
      failed: true,
      url: "https://www.instagram.com/other",
      savedUrl: saved,
    }),
    null,
  );
  assert.equal(
    profileLookupMessage("instagram", "other", { attempted: false, html: null }).message,
    null,
  );

  const note = socialLookupNote({
    platform: "instagram",
    attempted: true,
    failed: true,
    url: "https://www.instagram.com/other",
    savedUrl: saved,
  });
  assert.equal(note, socialLookupBlockedMessage("instagram"));
  assert.match(note ?? "", /We could not open this Instagram profile automatically/);

  const opened = profileLookupMessage("tiktok", "backie", {
    attempted: true,
    html: "<html><title>@backie</title></html>",
  });
  assert.equal(opened.verified, true);
  assert.equal(opened.message, null);

  const blocked = profileLookupMessage("tiktok", "backie", { attempted: true, html: null });
  assert.equal(blocked.verified, false);
  assert.match(blocked.message ?? "", /We could not open this TikTok profile automatically/);
});

test("an error page body is not treated as a profile", () => {
  const html = `<html><title>Error 404 (Not Found)!!1</title><p><b>404.</b> <ins>That’s an error.</ins>
  <p>The requested URL <code>/?utm_source=ig&amp;utm_medium=social&amp;utm_content=link_in_bio</code> was not found on this server. <ins>That’s all we know.</ins>`;
  assert.equal(htmlLooksLikeErrorPage(html), true);
  assert.equal(htmlLooksLikeErrorPage("<html><title>@backie</title><p>creator</p>"), false);
});
