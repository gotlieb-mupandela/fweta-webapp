"use client";

import { useState, useTransition } from "react";

import { uploadAvatarAction } from "@/app/actions/avatar";
import { FieldError, Input, Label } from "@/components/ui/input";
import { AVATAR_MAX_BYTES, isAllowedImageType, uploadLimitMessage } from "@/lib/uploads/limits";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/onboarding/model";
import type { OnboardingDraft } from "@/lib/db/types";
import type { SocialPlatform } from "@/types/enums";

function handleFromUrl(value: string | undefined): string {
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) return value.replace(/^@/, "");
  try {
    const url = new URL(value);
    const tail = url.pathname.split("/").filter(Boolean).pop() ?? "";
    return tail.replace(/^@/, "");
  } catch {
    return "";
  }
}

export function CompanyStep({
  draft,
  avatarUrl,
  onChange,
}: {
  draft: OnboardingDraft;
  avatarUrl: string | null;
  onChange: (patch: Partial<OnboardingDraft>) => void;
}) {
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoNote, setLogoNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [handles, setHandles] = useState<Record<SocialPlatform, string>>(() => ({
    tiktok: handleFromUrl(draft.brandSocials.tiktok),
    instagram: handleFromUrl(draft.brandSocials.instagram),
    facebook: handleFromUrl(draft.brandSocials.facebook),
    youtube: handleFromUrl(draft.brandSocials.youtube),
    x: handleFromUrl(draft.brandSocials.x),
  }));

  function updateHandle(platform: SocialPlatform, value: string) {
    const next = { ...handles, [platform]: value };
    setHandles(next);
    onChange({
      brandSocials: {
        tiktok: next.tiktok,
        instagram: next.instagram,
        facebook: next.facebook,
        youtube: next.youtube,
        x: next.x,
      },
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="companyName">Business name</Label>
        <Input
          id="companyName"
          value={draft.companyName}
          autoComplete="organization"
          placeholder="Desert Brands"
          onChange={(event) => onChange({ companyName: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="website">Website</Label>
        <Input
          id="website"
          type="url"
          inputMode="url"
          value={draft.website}
          placeholder="https://yourbrand.com"
          onChange={(event) => onChange({ website: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="logo">Logo</Label>
        <div className="flex items-center gap-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview or stored avatar URL
            <img src={preview} alt="" className="size-14 rounded-2xl border border-border object-cover" />
          ) : (
            <span className="flex size-14 items-center justify-center rounded-2xl border border-dashed border-border text-xs text-muted">
              Logo
            </span>
          )}
          <div className="min-w-0 flex-1">
            <Input
              id="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const tooBig = uploadLimitMessage(file, AVATAR_MAX_BYTES, "Logo");
                if (tooBig) {
                  setLogoError(tooBig);
                  setLogoNote(null);
                  return;
                }
                if (!isAllowedImageType(file.type)) {
                  setLogoError("Use a JPEG, PNG, or WebP image.");
                  setLogoNote(null);
                  return;
                }
                setPreview(URL.createObjectURL(file));
                setLogoError(null);
                setLogoNote(null);
                const body = new FormData();
                body.set("file", file);
                body.set("kind", "profile");
                startTransition(async () => {
                  const res = await uploadAvatarAction(body);
                  if (!res.ok) {
                    setLogoError(res.error);
                    setPreview(avatarUrl);
                    return;
                  }
                  setPreview(res.url);
                  setLogoNote("Logo saved.");
                });
              }}
            />
            <p className="mt-1 text-xs text-muted">{pending ? "Uploading..." : "PNG, JPEG, or WebP. 2 MB or smaller. Optional."}</p>
          </div>
        </div>
        <FieldError>{logoError}</FieldError>
        {logoNote ? <p className="mt-1 text-sm text-success">{logoNote}</p> : null}
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Business socials</legend>
        <p className="text-xs text-muted">Optional. These are the brand accounts, not a personal creator profile.</p>
        {PLATFORMS.map((platform) => (
          <div key={platform}>
            <Label htmlFor={`brand-${platform}`}>{PLATFORM_LABEL[platform]}</Label>
            <Input
              id={`brand-${platform}`}
              value={handles[platform]}
              placeholder="@brand"
              autoCapitalize="off"
              onChange={(event) => updateHandle(platform, event.target.value)}
            />
          </div>
        ))}
      </fieldset>
    </div>
  );
}
