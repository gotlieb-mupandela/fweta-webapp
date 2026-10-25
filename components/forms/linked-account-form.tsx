"use client";

import { useState } from "react";

import { startLinkAccountAction, verifyLinkAccountAction } from "@/app/actions/submissions";
import { useTimedSave } from "@/components/forms/use-timed-save";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { LinkedSocialAccount } from "@/lib/db/types";
import { PLATFORM_LABEL } from "@/lib/rewards/content-rewards";
import type { SocialPlatform } from "@/types/enums";

const PLATFORMS: SocialPlatform[] = ["tiktok", "instagram", "facebook", "youtube", "x"];

export function LinkedAccountForm({ accounts }: { accounts: LinkedSocialAccount[] }) {
  const save = useTimedSave();
  const [platform, setPlatform] = useState<SocialPlatform>("tiktok");
  const [handle, setHandle] = useState("");

  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            const outcome = await save.run(() =>
              startLinkAccountAction({
                platform,
                handle,
              }),
            );
            if (outcome.status !== "ok") return;
            if (!outcome.result.ok) {
              save.fail(outcome.result.error);
              return;
            }
            setHandle("");
            save.succeed("Bio code created. Add it to your bio, then confirm.");
            save.refresh();
          })();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="platform">Platform</Label>
            <Select
              id="platform"
              name="platform"
              value={platform}
              onChange={(event) => setPlatform(event.target.value as SocialPlatform)}
            >
              {PLATFORMS.map((item) => (
                <option key={item} value={item}>
                  {PLATFORM_LABEL[item]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="handle">Handle</Label>
            <Input
              id="handle"
              name="handle"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              required
              placeholder="yourhandle"
            />
          </div>
        </div>
        <FieldError>{save.error}</FieldError>
        <FieldSuccess>{save.success}</FieldSuccess>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? "Saving..." : "Get a bio code"}
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
  const save = useTimedSave();
  const [bio, setBio] = useState("");
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
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              const outcome = await save.run(() =>
                verifyLinkAccountAction({
                  id: account.id,
                  pastedBio: bio,
                }),
              );
              if (outcome.status !== "ok") return;
              if (!outcome.result.ok) {
                save.fail(outcome.result.error);
                return;
              }
              save.succeed("Bio code confirmed.");
              save.refresh();
            })();
          }}
        >
          <Label htmlFor={`bio-${account.id}`}>Public bio, local demo only</Label>
          <Textarea
            id={`bio-${account.id}`}
            name="pastedBio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder={`Paste a bio that contains ${account.bioCode}`}
          />
          <p className="text-xs text-muted">
            Used only when no view provider can read the bio, and only outside production.
          </p>
          <FieldError>{save.error}</FieldError>
          <FieldSuccess>{save.success}</FieldSuccess>
          <Button type="submit" size="sm" disabled={save.pending}>
            {save.pending ? "Checking..." : "Confirm bio code"}
          </Button>
        </form>
      )}
    </li>
  );
}
