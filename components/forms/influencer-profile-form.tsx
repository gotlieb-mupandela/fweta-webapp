"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { upsertInfluencerProfileAction } from "@/app/actions/influencer";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import type { InfluencerProfile } from "@/lib/db/types";

export function InfluencerProfileForm({ profile }: { profile: InfluencerProfile | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const res = await upsertInfluencerProfileAction({
            displayName: String(fd.get("displayName") || ""),
            headline: String(fd.get("headline") || ""),
            bio: String(fd.get("bio") || ""),
            niche: String(fd.get("niche") || ""),
            location: String(fd.get("location") || ""),
            socials: {
              tiktok: String(fd.get("tiktok") || ""),
              youtube: String(fd.get("youtube") || ""),
              instagram: String(fd.get("instagram") || ""),
              x: String(fd.get("x") || ""),
            },
            published: fd.get("published") === "on",
          });
          if (!res.ok) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="displayName">Display name</Label>
        <Input id="displayName" name="displayName" required defaultValue={profile?.displayName} />
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
          <Input id="tiktok" name="tiktok" type="url" defaultValue={profile?.socials.tiktok ?? ""} />
        </div>
        <div>
          <Label htmlFor="youtube">YouTube URL</Label>
          <Input id="youtube" name="youtube" type="url" defaultValue={profile?.socials.youtube ?? ""} />
        </div>
        <div>
          <Label htmlFor="instagram">Instagram URL</Label>
          <Input id="instagram" name="instagram" type="url" defaultValue={profile?.socials.instagram ?? ""} />
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
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
