"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { removeAvatarAction, uploadAvatarAction } from "@/app/actions/avatar";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Label } from "@/components/ui/input";
import { AVATAR_MAX_BYTES, isAllowedImageType, uploadLimitMessage } from "@/lib/uploads/limits";
import { cleanDisplayName } from "@/lib/text/display-name";

export function AvatarUpload({
  avatarUrl,
  displayName,
  kind = "profile",
  label = "Profile photo",
}: {
  avatarUrl: string | null;
  displayName: string;
  kind?: "profile" | "influencer";
  label?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [override, setOverride] = useState<string | null | undefined>(undefined);
  const preview = override === undefined ? avatarUrl : override;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const safeName = cleanDisplayName(displayName) || "Creator";
  const initials = safeName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  function replacePreview(next: string | null) {
    setOverride((current) => {
      const shown = current === undefined ? avatarUrl : current;
      if (shown?.startsWith("blob:")) URL.revokeObjectURL(shown);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="flex items-center gap-4">
        <div className="relative size-20 overflow-hidden rounded-full border border-border bg-surface-2">
          {preview ? (
            <Image
              src={preview}
              alt={safeName}
              fill
              className="object-cover"
              sizes="80px"
              unoptimized
            />
          ) : (
            <span className="flex size-full items-center justify-center font-display text-xl text-muted">
              {initials || "?"}
            </span>
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setError(null);
              setSuccess(null);
              const tooBig = uploadLimitMessage(file, AVATAR_MAX_BYTES, "Image");
              if (tooBig) {
                setError(tooBig);
                return;
              }
              if (!isAllowedImageType(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
                setError("Use a JPEG, PNG, or WebP image.");
                return;
              }
              replacePreview(URL.createObjectURL(file));
              const fd = new FormData();
              fd.set("file", file);
              fd.set("kind", kind);
              startTransition(async () => {
                try {
                  const res = await uploadAvatarAction(fd);
                  if (!res.ok) {
                    setError(res.error || "Upload failed.");
                    replacePreview(avatarUrl);
                    return;
                  }
                  replacePreview(res.url);
                  setSuccess(`${label} saved.`);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error && err.message ? err.message : "Upload failed.");
                  replacePreview(avatarUrl);
                }
              });
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              {pending ? "Uploading…" : preview ? "Change photo" : "Upload photo"}
            </Button>
            {preview ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                  startTransition(async () => {
                    const res = await removeAvatarAction();
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    replacePreview(null);
                    setSuccess(`${label} removed.`);
                    router.refresh();
                  });
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted">JPEG, PNG, or WebP. 2 MB or smaller.</p>
        </div>
      </div>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
    </div>
  );
}
