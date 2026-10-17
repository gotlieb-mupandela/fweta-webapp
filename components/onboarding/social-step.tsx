"use client";

import { useState, useTransition } from "react";

import { setSocialHandleAction, verifySocialAction } from "@/app/actions/onboarding";
import { PlatformIcon } from "@/components/admin/platform-icon";
import { Hint } from "@/components/onboarding/hint";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { FIELD_HINTS, PLATFORM_LABEL, PLATFORMS } from "@/lib/onboarding/model";
import type { OnboardingDraft } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import type { SocialPlatform } from "@/types/enums";

export function SocialStep({
  draft,
  onDraft,
}: {
  draft: OnboardingDraft;
  onDraft: (draft: OnboardingDraft) => void;
}) {
  const [handles, setHandles] = useState<Record<SocialPlatform, string>>(() => {
    const initial = { tiktok: "", instagram: "", youtube: "", x: "" };
    for (const check of draft.checks) initial[check.platform] = check.handle;
    return initial;
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function checkFor(platform: SocialPlatform) {
    return draft.checks.find((item) => item.platform === platform);
  }

  function saveHandle(platform: SocialPlatform) {
    setError(null);
    setNotice(null);
    setBusy(platform);
    startTransition(async () => {
      const res = await setSocialHandleAction({ platform, handle: handles[platform] });
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDraft(res.draft);
      setNotice(`Code ready for ${PLATFORM_LABEL[platform]}. Paste it in the bio, then check.`);
    });
  }

  function verify(platform: SocialPlatform) {
    setError(null);
    setNotice(null);
    setBusy(`verify-${platform}`);
    startTransition(async () => {
      const res = await verifySocialAction(platform);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDraft(res.draft);
      setNotice(`${PLATFORM_LABEL[platform]} is verified.`);
    });
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setNotice("Code copied.");
    } catch {
      setNotice("Select the code and copy it into the bio.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">TikTok, Instagram, YouTube, or X.</p>
        <Hint text={FIELD_HINTS.bio} label="How checking works" />
      </div>
      <ul className="space-y-3">
        {PLATFORMS.map((platform) => {
          const saved = checkFor(platform);
          const matches = saved?.handle.toLowerCase() === handles[platform].trim().replace(/^@/, "").toLowerCase();
          return (
            <li key={platform} className="rounded-2xl border border-border bg-white p-3.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="flex size-8 items-center justify-center rounded-xl bg-surface-2">
                  <PlatformIcon platform={platform} />
                </span>
                {PLATFORM_LABEL[platform]}
                {saved?.status === "verified" ? (
                  <span className="ml-auto rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                    Verified
                  </span>
                ) : null}
              </div>
              <Label htmlFor={`handle-${platform}`} className="sr-only">
                {PLATFORM_LABEL[platform]} handle
              </Label>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  id={`handle-${platform}`}
                  value={handles[platform]}
                  placeholder="@handle"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) =>
                    setHandles((current) => ({ ...current, [platform]: event.target.value }))
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="sm:w-auto"
                  disabled={busy !== null || handles[platform].trim().length < 2}
                  onClick={() => saveHandle(platform)}
                >
                  {busy === platform ? "Saving..." : "Get code"}
                </Button>
              </div>
              {saved && matches ? (
                <div className="mt-3 rounded-2xl bg-gold-soft/70 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-deep">
                    Bio code
                  </p>
                  <p className="mt-1 font-mono text-lg tracking-wide text-foreground">{saved.code}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => copyCode(saved.code)}>
                      Copy code
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy !== null || saved.status === "verified"}
                      onClick={() => verify(platform)}
                    >
                      {busy === `verify-${platform}` ? "Checking..." : "Check bio"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <FieldError>{error}</FieldError>
      {notice ? (
        <p className={cn("text-sm text-muted")} role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
