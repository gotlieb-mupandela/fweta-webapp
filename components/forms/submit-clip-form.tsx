"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { submitClipAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label } from "@/components/ui/input";
import { detectPlatform, PLATFORM_LABEL } from "@/lib/rewards/content-rewards";
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
  const [url, setUrl] = useState("");
  const [viewsAtSubmit, setViewsAtSubmit] = useState("");
  const [pending, startTransition] = useTransition();
  const exhausted = remainingBudgetCents !== undefined && remainingBudgetCents <= 0;
  const detected = useMemo(() => (url.trim() ? detectPlatform(url) : null), [url]);
  const allowed = detected ? platforms.includes(detected) : false;

  if (platforms.length === 0) {
    return <p className="text-sm text-muted">This campaign has no allowed platforms.</p>;
  }

  if (exhausted) {
    return <p className="text-sm text-muted">Budget spent. This campaign is no longer paying.</p>;
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        if (!detected) {
          setError("Paste a public TikTok, Instagram, YouTube, or X link.");
          return;
        }
        const viewsText = viewsAtSubmit.trim();
        const views = viewsText === "" ? undefined : Number(viewsText);
        if (views !== undefined && (!Number.isInteger(views) || views < 0)) {
          setError("Views already on the post must be a whole number.");
          return;
        }
        startTransition(async () => {
          const res = await submitClipAction({
            campaignId,
            postUrl: url.trim(),
            platform: detected,
            viewsAtSubmit: views,
          });
          if (!res.ok) setError(res.error);
          else {
            setUrl("");
            setViewsAtSubmit("");
            setSuccess("Submitted for review. Track it under Submissions.");
            router.refresh();
          }
        });
      }}
    >
      <div>
        <Label htmlFor={`url-${campaignId}`}>Post link</Label>
        <Input
          id={`url-${campaignId}`}
          name="postUrl"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@you/video/…"
        />
        <p className="mt-1.5 text-xs text-muted">
          {detected
            ? allowed
              ? `Detected ${PLATFORM_LABEL[detected]}.`
              : `${PLATFORM_LABEL[detected]} is not paid on this campaign.`
            : `Accepted: ${platforms.map((platform) => PLATFORM_LABEL[platform]).join(", ")}.`}
        </p>
      </div>
      <div>
        <Label htmlFor={`views-${campaignId}`}>Views already on this post</Label>
        <Input
          id={`views-${campaignId}`}
          name="viewsAtSubmit"
          inputMode="numeric"
          min={0}
          step={1}
          value={viewsAtSubmit}
          onChange={(e) => setViewsAtSubmit(e.target.value)}
          placeholder="0"
        />
        <p className="mt-1.5 text-xs text-muted">
          Leave blank for a new post. Only views above this number are paid.
        </p>
      </div>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
      <Button type="submit" disabled={pending || (Boolean(detected) && !allowed)}>
        {pending ? "Submitting…" : "Submit clip"}
      </Button>
    </form>
  );
}
