"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { submitClipAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import type { SocialPlatform } from "@/types/enums";

export function SubmitClipForm({
  campaignId,
  platforms,
}: {
  campaignId: string;
  platforms: SocialPlatform[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        const form = e.currentTarget;
        startTransition(async () => {
          const res = await submitClipAction({
            campaignId,
            postUrl: String(fd.get("postUrl") || ""),
            platform: String(fd.get("platform") || platforms[0]) as SocialPlatform,
          });
          if (!res.ok) setError(res.error);
          else {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <div>
        <Label htmlFor={`url-${campaignId}`}>Post URL</Label>
        <Input id={`url-${campaignId}`} name="postUrl" type="url" required placeholder="https://" />
      </div>
      <div>
        <Label htmlFor={`platform-${campaignId}`}>Platform</Label>
        <Select id={`platform-${campaignId}`} name="platform" defaultValue={platforms[0]}>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Submitting…" : "Submit clip"}
      </Button>
    </form>
  );
}
