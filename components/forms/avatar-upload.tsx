"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { uploadAvatarAction } from "@/app/actions/avatar";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/input";

export function AvatarUpload({
  avatarUrl,
  displayName,
  kind = "profile",
}: {
  avatarUrl: string | null;
  displayName: string;
  kind?: "profile" | "influencer";
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="space-y-3">
      <Label>Profile photo</Label>
      <div className="flex items-center gap-4">
        <div className="relative size-20 overflow-hidden rounded-full border border-border bg-surface-2">
          {preview ? (
            <Image
              src={preview}
              alt={displayName}
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
              if (!file) return;
              setError(null);
              const local = URL.createObjectURL(file);
              setPreview(local);
              const fd = new FormData();
              fd.set("file", file);
              fd.set("kind", kind);
              startTransition(async () => {
                const res = await uploadAvatarAction(fd);
                if (!res.ok) {
                  setError(res.error);
                  setPreview(avatarUrl);
                  return;
                }
                setPreview(res.url);
                router.refresh();
              });
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            {pending ? "Uploading…" : preview ? "Change photo" : "Upload photo"}
          </Button>
          <p className="text-xs text-muted">JPEG, PNG, or WebP · max 2MB</p>
        </div>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
