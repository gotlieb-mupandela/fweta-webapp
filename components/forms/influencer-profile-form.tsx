"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { upsertInfluencerProfileAction } from "@/app/actions/influencer";
import { previewSocialProfileAction } from "@/app/actions/social-profile";
import { AvatarUpload } from "@/components/forms/avatar-upload";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Textarea } from "@/components/ui/input";
import type { InfluencerProfile, ProfileSocials } from "@/lib/db/types";
import { displaySocialUrl, normalizeSocialProfileUrl, socialLookupNote } from "@/lib/social/profile-url";
import { PLATFORM_LABEL } from "@/lib/social/platforms";
import { cleanDisplayName } from "@/lib/text/display-name";
import type { SocialPlatform } from "@/types/enums";

const SOCIAL_FIELDS: { id: SocialPlatform; label: string }[] = [
  { id: "tiktok", label: "TikTok URL" },
  { id: "youtube", label: "YouTube URL" },
  { id: "instagram", label: "Instagram URL" },
  { id: "facebook", label: "Facebook URL" },
  { id: "x", label: "X URL" },
];

type SocialNote = { tone: "error" | "muted"; text: string };

function initialSocials(profile: InfluencerProfile | null): ProfileSocials {
  return {
    tiktok: displaySocialUrl("tiktok", profile?.socials.tiktok),
    youtube: displaySocialUrl("youtube", profile?.socials.youtube),
    instagram: displaySocialUrl("instagram", profile?.socials.instagram),
    facebook: displaySocialUrl("facebook", profile?.socials.facebook),
    x: displaySocialUrl("x", profile?.socials.x),
  };
}

function initialNotes(profile: InfluencerProfile | null): Partial<Record<SocialPlatform, SocialNote>> {
  const notes: Partial<Record<SocialPlatform, SocialNote>> = {};
  for (const field of SOCIAL_FIELDS) {
    const raw = profile?.socials[field.id];
    if (!raw?.trim()) continue;
    const parsed = normalizeSocialProfileUrl(field.id, raw);
    if (!parsed.ok) notes[field.id] = { tone: "error", text: parsed.message };
  }
  return notes;
}

export function InfluencerProfileForm({ profile }: { profile: InfluencerProfile | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const [socials, setSocials] = useState<ProfileSocials>(() => initialSocials(profile));
  const [notes, setNotes] = useState<Partial<Record<SocialPlatform, SocialNote>>>(() => initialNotes(profile));
  const lastValid = useRef<ProfileSocials>(initialSocials(profile));
  const focused = useRef<ProfileSocials>(initialSocials(profile));
  const savedUrls = useRef<ProfileSocials>(initialSocials(profile));
  const lookupGen = useRef<Partial<Record<SocialPlatform, number>>>({});
  const displayName = cleanDisplayName(profile?.displayName ?? "") || "Creator";

  function rememberValid(platform: SocialPlatform, url: string) {
    lastValid.current[platform] = url;
  }

  function commitSocials(): ProfileSocials | null {
    const next: ProfileSocials = { ...socials };
    const nextNotes: Partial<Record<SocialPlatform, SocialNote>> = { ...notes };
    let blocked = false;
    for (const field of SOCIAL_FIELDS) {
      const parsed = normalizeSocialProfileUrl(field.id, next[field.id] ?? "");
      if (!parsed.ok) {
        blocked = true;
        const prior = focused.current[field.id] ?? "";
        const priorOk = normalizeSocialProfileUrl(field.id, prior);
        next[field.id] = priorOk.ok ? priorOk.url : lastValid.current[field.id] ?? "";
        nextNotes[field.id] = { tone: "error", text: parsed.message };
      } else {
        next[field.id] = parsed.url;
        rememberValid(field.id, parsed.url);
        if (nextNotes[field.id]?.tone === "error") delete nextNotes[field.id];
      }
    }
    setSocials(next);
    setNotes(nextNotes);
    return blocked ? null : next;
  }

  function cancelLookup(platform: SocialPlatform) {
    lookupGen.current[platform] = (lookupGen.current[platform] ?? 0) + 1;
  }

  function onSocialBlur(platform: SocialPlatform, raw: string) {
    const parsed = normalizeSocialProfileUrl(platform, raw);
    if (!parsed.ok) {
      cancelLookup(platform);
      const restore = focused.current[platform] ?? lastValid.current[platform] ?? "";
      const restored = normalizeSocialProfileUrl(platform, restore);
      const keep = restored.ok ? restored.url : "";
      setSocials((current) => ({ ...current, [platform]: keep }));
      setNotes((current) => ({ ...current, [platform]: { tone: "error", text: parsed.message } }));
      return;
    }
    rememberValid(platform, parsed.url);
    setSocials((current) => ({ ...current, [platform]: parsed.url }));
    if (!parsed.url) {
      cancelLookup(platform);
      setNotes((current) => {
        if (!raw.trim() && current[platform]?.tone === "error") return current;
        const next = { ...current };
        delete next[platform];
        return next;
      });
      return;
    }
    if (parsed.url === (savedUrls.current[platform] ?? "")) {
      cancelLookup(platform);
      setNotes((current) => {
        if (!current[platform]) return current;
        const next = { ...current };
        delete next[platform];
        return next;
      });
      return;
    }
    const gen = (lookupGen.current[platform] ?? 0) + 1;
    lookupGen.current[platform] = gen;
    setNotes((current) => ({ ...current, [platform]: { tone: "muted", text: "Checking this profile." } }));
    void previewSocialProfileAction({ platform, value: parsed.url }).then(
      (preview) => {
        if (lookupGen.current[platform] !== gen) return;
        if (!preview.ok) {
          const restored = normalizeSocialProfileUrl(platform, focused.current[platform] ?? "");
          const keep = restored.ok ? restored.url : "";
          lastValid.current[platform] = keep;
          setSocials((current) => ({ ...current, [platform]: keep }));
          setNotes((current) => ({ ...current, [platform]: { tone: "error", text: preview.message } }));
          return;
        }
        if (preview.url !== parsed.url) return;
        setNotes((current) => {
          const text = socialLookupNote({
            platform,
            attempted: preview.attempted,
            failed: !preview.verified,
            url: preview.url,
            savedUrl: savedUrls.current[platform] ?? "",
          });
          if (!text) {
            const next = { ...current };
            delete next[platform];
            return next;
          }
          return { ...current, [platform]: { tone: "muted", text } };
        });
      },
      () => {
        if (lookupGen.current[platform] !== gen) return;
        setNotes((current) => ({
          ...current,
          [platform]: {
            tone: "muted",
            text: `${PLATFORM_LABEL[platform]} could not be checked just now. The link stays if it is a valid profile URL.`,
          },
        }));
      },
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <AvatarUpload
        avatarUrl={profile?.avatarUrl ?? null}
        displayName={displayName}
        kind="influencer"
      />

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const nameInput = e.currentTarget.elements.namedItem("displayName");
          const displayNameValue = cleanDisplayName(String(fd.get("displayName") || ""));
          if (nameInput instanceof HTMLInputElement) nameInput.value = displayNameValue;
          setError(null);
          if (displayNameValue.length < 2) {
            setError("Enter a display name without HTML tags.");
            return;
          }
          const nextSocials = commitSocials();
          if (!nextSocials) return;
          setSuccess(false);
          startTransition(async () => {
            try {
              const res = await upsertInfluencerProfileAction({
                displayName: displayNameValue,
                headline: String(fd.get("headline") || ""),
                bio: String(fd.get("bio") || ""),
                niche: String(fd.get("niche") || ""),
                location: String(fd.get("location") || ""),
                socials: {
                  tiktok: nextSocials.tiktok ?? "",
                  youtube: nextSocials.youtube ?? "",
                  instagram: nextSocials.instagram ?? "",
                  facebook: nextSocials.facebook ?? "",
                  x: nextSocials.x ?? "",
                },
                published: fd.get("published") === "on",
              });
              if (!res.ok) setError(res.error);
              else {
                savedUrls.current = nextSocials;
                setNotes((current) => {
                  const next = { ...current };
                  for (const field of SOCIAL_FIELDS) {
                    if (next[field.id]?.tone === "muted") delete next[field.id];
                  }
                  return next;
                });
                setSuccess(true);
                router.refresh();
              }
            } catch {
              setError("Could not save the profile. Try again.");
            }
          });
        }}
      >
        <div>
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" name="displayName" required maxLength={80} defaultValue={displayName} />
        </div>
        <div>
          <Label htmlFor="headline">Headline</Label>
          <Input id="headline" name="headline" required defaultValue={profile?.headline} />
        </div>
        <div>
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" name="bio" required defaultValue={profile?.bio} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="niche">Niche</Label>
            <Input id="niche" name="niche" required defaultValue={profile?.niche} />
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <Input id="location" name="location" required defaultValue={profile?.location} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIAL_FIELDS.map((field) => {
            const note = notes[field.id];
            return (
              <div key={field.id}>
                <Label htmlFor={field.id}>{field.label}</Label>
                <Input
                  id={field.id}
                  name={field.id}
                  type="text"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Profile link or @handle"
                  value={socials[field.id] ?? ""}
                  aria-invalid={note?.tone === "error" ? true : undefined}
                  aria-describedby={note ? `${field.id}-note` : undefined}
                  onFocus={() => {
                    focused.current[field.id] = socials[field.id] ?? "";
                  }}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSocials((current) => ({ ...current, [field.id]: value }));
                  }}
                  onBlur={(event) => onSocialBlur(field.id, event.currentTarget.value)}
                />
                {note ? (
                  <p
                    id={`${field.id}-note`}
                    role={note.tone === "error" ? "alert" : undefined}
                    className={
                      note.tone === "error"
                        ? "mt-1.5 text-sm leading-relaxed text-danger"
                        : "mt-1.5 text-sm leading-relaxed text-muted"
                    }
                  >
                    {note.text}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={profile?.published} />
          Publish profile publicly
        </label>
        <FieldError>{error}</FieldError>
        <FieldSuccess>{success ? "Profile saved." : null}</FieldSuccess>
        <Button type="submit" className="sticky-submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </div>
  );
}
