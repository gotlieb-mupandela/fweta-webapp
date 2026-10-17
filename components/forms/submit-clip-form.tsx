"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { submitClipAction } from "@/app/actions/submissions";
import { Hint } from "@/components/onboarding/hint";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Select } from "@/components/ui/input";
import { PLATFORM_LABEL } from "@/lib/onboarding/model";
import { formatMoney } from "@/lib/utils";
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
  const [platform, setPlatform] = useState<SocialPlatform>(platforms[0]);
  const [pending, startTransition] = useTransition();
  const platformAccounts = accounts.filter((account) => account.platform === platform);
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
          const socialAccountId = String(fd.get("socialAccountId") || "");
          const res = await submitClipAction({
            campaignId,
            postUrl: String(fd.get("postUrl") || ""),
            platform,
            socialAccountId: socialAccountId || undefined,
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
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`platform-${campaignId}`}>Platform</Label>
          <Hint text="Pick the platform you posted on, then the connected account the clip came from." label="Which account" />
        </div>
        <Select
          id={`platform-${campaignId}`}
          name="platform"
          value={platform}
          onChange={(event) => setPlatform(event.target.value as SocialPlatform)}
        >
          {platforms.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
            </option>
          ))}
        </Select>
      </div>
      {platformAccounts.length > 0 ? (
        <div>
          <Label htmlFor={`account-${campaignId}`}>Posted from</Label>
          <Select
            key={platform}
            id={`account-${campaignId}`}
            name="socialAccountId"
            defaultValue={platformAccounts.find((account) => account.isDefault)?.id ?? platformAccounts[0]?.id}
          >
            {platformAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {PLATFORM_LABEL[account.platform]} @{account.handle}
                {account.isDefault ? " (default)" : ""}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Connect a verified account under Settings if you want this clip tied to a specific profile.
        </p>
      )}
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
