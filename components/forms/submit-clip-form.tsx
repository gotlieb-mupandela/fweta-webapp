"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { submitClipAction } from "@/app/actions/submissions";
import { Hint } from "@/components/onboarding/hint";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Select } from "@/components/ui/input";
import { detectPlatform, PLATFORM_LABEL } from "@/lib/rewards/content-rewards";
import type { SocialPlatform } from "@/types/enums";

export type SubmitAccount = {
  id: string;
  handle: string;
  platform: SocialPlatform;
  isDefault: boolean;
};

export function SubmitClipForm({
  campaignId,
  platforms,
  remainingBudgetCents,
  accounts = [],
}: {
  campaignId: string;
  platforms: SocialPlatform[];
  remainingBudgetCents?: number;
  accounts?: SubmitAccount[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [viewsAtSubmit, setViewsAtSubmit] = useState("");
  const [accountId, setAccountId] = useState("");
  const [pending, startTransition] = useTransition();
  const detected = useMemo(() => (url.trim() ? detectPlatform(url) : null), [url]);
  const allowed = detected ? platforms.includes(detected) : false;
  const platformAccounts = detected
    ? accounts.filter((account) => account.platform === detected)
    : [];
  const exhausted = remainingBudgetCents !== undefined && remainingBudgetCents <= 0;

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
        if (!detected || !allowed) {
          setError("Paste a public TikTok, Instagram, YouTube, or X link this campaign pays for.");
          return;
        }
        const viewsText = viewsAtSubmit.trim();
        const views = viewsText === "" ? undefined : Number(viewsText);
        if (views !== undefined && (!Number.isInteger(views) || views < 0)) {
          setError("Views already on the post must be a whole number.");
          return;
        }
        if (platformAccounts.length > 0 && !accountId && !platformAccounts[0]) {
          setError("Choose which connected account this clip came from.");
          return;
        }
        const socialAccountId = accountId || platformAccounts.find((account) => account.isDefault)?.id || platformAccounts[0]?.id;
        startTransition(async () => {
          const res = await submitClipAction({
            campaignId,
            postUrl: url.trim(),
            platform: detected,
            viewsAtSubmit: views,
            socialAccountId,
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
      {platformAccounts.length > 0 ? (
        <div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`account-${campaignId}`}>Posted from</Label>
            <Hint
              text="Pick the connected account this clip came from. The default is only a suggestion."
              label="Which account"
            />
          </div>
          <Select
            id={`account-${campaignId}`}
            name="socialAccountId"
            value={accountId || platformAccounts.find((account) => account.isDefault)?.id || platformAccounts[0]?.id}
            onChange={(event) => setAccountId(event.target.value)}
          >
            {platformAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {PLATFORM_LABEL[account.platform]} @{account.handle}
                {account.isDefault ? " (default)" : ""}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
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
