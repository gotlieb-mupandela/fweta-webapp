"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateProfileAction } from "@/app/actions/settings";
import { AvatarUpload } from "@/components/forms/avatar-upload";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Textarea } from "@/components/ui/input";
import { cleanDisplayName } from "@/lib/text/display-name";

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
  const safeName = cleanDisplayName(displayName);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="max-w-md space-y-6">
      <AvatarUpload avatarUrl={avatarUrl} displayName={safeName || displayName} kind="profile" />

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const nameInput = e.currentTarget.elements.namedItem("displayName");
          const displayNameValue = cleanDisplayName(String(fd.get("displayName") || ""));
          if (nameInput instanceof HTMLInputElement) nameInput.value = displayNameValue;
          setError(null);
          setSuccess(false);
          if (displayNameValue.length < 2) {
            setError("Enter a display name without HTML tags.");
            return;
          }
          startTransition(async () => {
            const res = await updateProfileAction({
              displayName: displayNameValue,
              bio: String(fd.get("bio") || ""),
            });
            if (!res.ok) setError(res.error);
            else {
              setSuccess(true);
              router.refresh();
            }
          });
        }}
      >
        <div>
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" name="displayName" required maxLength={80} defaultValue={safeName} />
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
