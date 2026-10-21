"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { submitClipAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Select } from "@/components/ui/input";
import { PLATFORM_LABEL } from "@/lib/social/platforms";
import { formatMoney } from "@/lib/utils";
import type { SocialPlatform } from "@/types/enums";

export function SubmitClipForm({
  campaignId,
  platforms,
  remainingBudgetCents,
  requiredChecks = [],
  hashtags = [],
}: {
  campaignId: string;
  platforms: SocialPlatform[];
  remainingBudgetCents?: number;
  accounts?: { id: string; handle: string; platform: SocialPlatform; isDefault: boolean }[];
  requiredChecks?: string[];
  hashtags?: string[];
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
    return <p className="text-sm text-muted">Budget exhausted. This campaign is no longer paying.</p>;
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
      {hashtags.length > 0 ? (
        <p className="text-sm text-muted">Include {hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}</p>
      ) : null}
      {requiredChecks.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {requiredChecks.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      <div>
        <Label htmlFor={`url-${campaignId}`}>Post URL</Label>
        <Input
          id={`url-${campaignId}`}
          name="postUrl"
          type="url"
          required
          placeholder="https://www.facebook.com/reel/… or another post link"
        />
      </div>
      <div>
        <Label htmlFor={`platform-${campaignId}`}>Platform</Label>
        <Select id={`platform-${campaignId}`} name="platform" defaultValue={platforms[0]}>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
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
