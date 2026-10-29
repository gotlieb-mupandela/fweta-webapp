"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateProfileAction } from "@/app/actions/settings";
import { AvatarUpload } from "@/components/forms/avatar-upload";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Textarea } from "@/components/ui/input";

export function ProfileSettingsForm({
  displayName,
  bio,
  avatarUrl,
}: {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="max-w-md space-y-6">
      <AvatarUpload avatarUrl={avatarUrl} displayName={displayName} kind="profile" />

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          setSuccess(false);
          const displayName = String(fd.get("displayName") || "").trim();
          const bio = String(fd.get("bio") || "");
          if (displayName.length < 2) {
            setError("Display name must be at least 2 characters.");
            return;
          }
          if (displayName.length > 80) {
            setError("Display name must be 80 characters or fewer.");
            return;
          }
          if (bio.length > 1000) {
            setError("Bio must be 1,000 characters or fewer.");
            return;
          }
          startTransition(async () => {
            try {
              const res = await updateProfileAction({
                displayName,
                bio,
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
          <Input id="displayName" name="displayName" required defaultValue={displayName} />
        </div>
        <div>
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" name="bio" defaultValue={bio} />
        </div>
        <FieldError>{error}</FieldError>
        <FieldSuccess>{success ? "Profile saved." : null}</FieldSuccess>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </div>
  );
}
