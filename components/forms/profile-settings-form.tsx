"use client";

import { useState } from "react";

import { updateProfileAction } from "@/app/actions/settings";
import { AvatarUpload } from "@/components/forms/avatar-upload";
import { useTimedSave } from "@/components/forms/use-timed-save";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Textarea } from "@/components/ui/input";
import { applySavedProfile } from "@/lib/forms/save-feedback";
import { profileUpdateSchema } from "@/lib/validations/auth";

export function ProfileSettingsForm({
  displayName: initialDisplayName,
  bio: initialBio,
  avatarUrl,
}: {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
}) {
  const save = useTimedSave();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);

  return (
    <div className="max-w-md space-y-6">
      <AvatarUpload avatarUrl={avatarUrl} displayName={displayName} kind="profile" />

      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = profileUpdateSchema.safeParse({ displayName, bio });
          if (!parsed.success) {
            save.fail(parsed.error.issues[0]?.message ?? "Invalid profile.");
            return;
          }
          void (async () => {
            const outcome = await save.run(() => updateProfileAction(parsed.data));
            if (outcome.status !== "ok") return;
            if (!outcome.result.ok) {
              save.fail(outcome.result.error);
              return;
            }
            const saved = applySavedProfile({
              displayName: outcome.result.profile.displayName,
              bio: outcome.result.profile.bio,
            });
            setDisplayName(saved.displayName);
            setBio(saved.bio);
            save.succeed("Profile saved.");
            save.refresh();
          })();
        }}
      >
        <div>
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            name="displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            aria-invalid={save.error?.toLowerCase().includes("display name") ? true : undefined}
            aria-describedby={save.error ? "profile-feedback" : undefined}
          />
        </div>
        <div>
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            name="bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            aria-invalid={save.error?.toLowerCase().includes("bio") ? true : undefined}
            aria-describedby={save.error ? "profile-feedback" : undefined}
          />
        </div>
        <div id="profile-feedback">
          <FieldError>{save.error}</FieldError>
          <FieldSuccess>{save.success}</FieldSuccess>
        </div>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? "Saving..." : "Save profile"}
        </Button>
      </form>
    </div>
  );
}
