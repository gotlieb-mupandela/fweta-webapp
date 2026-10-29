"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { startLinkAccountAction, verifyLinkAccountAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { LinkedSocialAccount } from "@/lib/db/types";
import { PLATFORM_LABEL } from "@/lib/rewards/content-rewards";
import type { SocialPlatform } from "@/types/enums";

const PLATFORMS: SocialPlatform[] = ["tiktok", "instagram", "facebook", "youtube", "x"];

function withoutDemoCopy(message: string): string {
  const cleaned = message
    .replace(/\s*This check is for local demo only\.?/gi, "")
    .replace(/,?\s*local demo only/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || "Paste the public bio that contains your code.";
}

export function LinkedAccountForm({ accounts }: { accounts: LinkedSocialAccount[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            const res = await startLinkAccountAction({
              platform: String(fd.get("platform")),
              handle: String(fd.get("handle") || ""),
            });
            if (!res.ok) setError(res.error);
            else router.refresh();
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="platform">Platform</Label>
            <Select id="platform" name="platform" defaultValue="tiktok">
              {PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {PLATFORM_LABEL[platform]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="handle">Handle</Label>
            <Input id="handle" name="handle" required placeholder="yourhandle" />
          </div>
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Get a bio code"}
        </Button>
      </form>

      <ul className="space-y-3">
        {accounts.map((account) => (
          <AccountRow key={account.id} account={account} />
        ))}
      </ul>
    </div>
  );
}

function AccountRow({ account }: { account: LinkedSocialAccount }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <li className="rounded-2xl border border-border p-4">
      <p className="text-sm font-medium">
        {PLATFORM_LABEL[account.platform]} · @{account.handle}
      </p>
      <p className="mt-1 text-sm">
        Put <span className="font-medium">{account.bioCode}</span> in the public bio, then confirm.
      </p>
      <p className="mt-1 text-xs text-muted">
        {account.verifiedAt ? `Verified ${new Date(account.verifiedAt).toLocaleString()}` : "Not verified yet"}
      </p>
      {account.verifiedAt ? null : (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setError(null);
            startTransition(async () => {
              const res = await verifyLinkAccountAction({
                id: account.id,
                pastedBio: String(fd.get("pastedBio") || ""),
              });
              if (!res.ok) setError(withoutDemoCopy(res.error));
              else router.refresh();
            });
          }}
        >
          <Label htmlFor={`bio-${account.id}`}>Public bio</Label>
          <Textarea
            id={`bio-${account.id}`}
            name="pastedBio"
            placeholder={`Paste a bio that contains ${account.bioCode}`}
          />
          <p className="text-xs text-muted">Paste the public bio that contains your code.</p>
          <FieldError>{error}</FieldError>
          <FieldSuccess>{null}</FieldSuccess>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Checking…" : "Confirm bio code"}
          </Button>
        </form>
      )}
    </li>
  );
}
