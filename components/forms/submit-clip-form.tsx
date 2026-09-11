"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { submitClipAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Select } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";
import type { SocialPlatform } from "@/types/enums";

export function SubmitClipForm({
  campaignId,
  platforms,
  remainingBudgetCents,
}: {
  campaignId: string;
  platforms: SocialPlatform[];
  remainingBudgetCents?: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const exhausted = remainingBudgetCents !== undefined && remainingBudgetCents <= 0;

  if (platforms.length === 0) {
    return <p className="text-sm text-muted">This campaign has no allowed platforms.</p>;
  }

  if (exhausted) {
    return <p className="text-sm text-muted">Budget exhausted — this campaign is no longer paying.</p>;
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setSuccess(null);
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
            setSuccess("Clip submitted for review. Track it under Submissions.");
            router.refresh();
          }
        });
      }}
    >
      <div>
        <Label htmlFor={`url-${campaignId}`}>Post URL</Label>
        <Input
          id={`url-${campaignId}`}
          name="postUrl"
          type="url"
          required
          placeholder="https://www.tiktok.com/@you/video/…"
        />
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
      <FieldSuccess>{success}</FieldSuccess>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Submitting…" : "Submit clip"}
      </Button>
      {remainingBudgetCents !== undefined ? (
        <p className="text-xs text-muted">Remaining budget {formatMoney(remainingBudgetCents)}</p>
      ) : null}
    </form>
  );
}
