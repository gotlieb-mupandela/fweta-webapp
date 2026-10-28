"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import { uploadAvatarAction } from "@/app/actions/avatar";
import { useTimedSave } from "@/components/forms/use-timed-save";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Label } from "@/components/ui/input";

export function AvatarUpload({
  avatarUrl,
  displayName,
  kind = "profile",
}: {
  avatarUrl: string | null;
  displayName: string;
  kind?: "profile" | "influencer";
}) {
  const save = useTimedSave();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);

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
              const local = URL.createObjectURL(file);
              setPreview(local);
              const fd = new FormData();
              fd.set("file", file);
              fd.set("kind", kind);
              void (async () => {
                const outcome = await save.run(() => uploadAvatarAction(fd));
                if (outcome.status !== "ok") return;
                if (!outcome.result.ok) {
                  save.fail(outcome.result.error);
                  setPreview(avatarUrl);
                  return;
                }
                setPreview(outcome.result.url);
                save.succeed("Photo saved.");
                save.refresh();
              })();
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={save.pending}
            onClick={() => inputRef.current?.click()}
          >
            {save.pending ? "Uploading..." : preview ? "Change photo" : "Upload photo"}
          </Button>
          <p className="text-xs text-muted">JPEG, PNG, or WebP · max 2MB</p>
        </div>
      </div>
      <FieldError>{save.error}</FieldError>
      <FieldSuccess>{save.success}</FieldSuccess>
    </div>
  );
}
