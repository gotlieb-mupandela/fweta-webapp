"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { upsertInfluencerProfileAction } from "@/app/actions/influencer";
import { AvatarUpload } from "@/components/forms/avatar-upload";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Textarea } from "@/components/ui/input";
import type { InfluencerProfile } from "@/lib/db/types";
import { cleanDisplayName } from "@/lib/text/display-name";

export function InfluencerProfileForm({ profile }: { profile: InfluencerProfile | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const displayName = cleanDisplayName(profile?.displayName ?? "") || "Creator";

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
                  tiktok: String(fd.get("tiktok") || ""),
                  youtube: String(fd.get("youtube") || ""),
                  instagram: String(fd.get("instagram") || ""),
                  facebook: String(fd.get("facebook") || ""),
                  x: String(fd.get("x") || ""),
                },
                published: fd.get("published") === "on",
              });
              if (!res.ok) setError(res.error);
              else {
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
          <div>
            <Label htmlFor="tiktok">TikTok URL</Label>
            <Input
              id="tiktok"
              name="tiktok"
              type="url"
              defaultValue={profile?.socials.tiktok ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="youtube">YouTube URL</Label>
            <Input
              id="youtube"
              name="youtube"
              type="url"
              defaultValue={profile?.socials.youtube ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="instagram">Instagram URL</Label>
            <Input
              id="instagram"
              name="instagram"
              type="url"
              defaultValue={profile?.socials.instagram ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="facebook">Facebook URL</Label>
            <Input
              id="facebook"
              name="facebook"
              type="url"
              defaultValue={profile?.socials.facebook ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="x">X URL</Label>
            <Input id="x" name="x" type="url" defaultValue={profile?.socials.x ?? ""} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={profile?.published} />
          Publish profile publicly
        </label>
        <FieldError>{error}</FieldError>
        <FieldSuccess>{success ? "Profile saved." : null}</FieldSuccess>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </div>
  );
}
