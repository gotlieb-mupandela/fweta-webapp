"use client";

import { useMemo, useState, useTransition } from "react";

import {
  addSocialAccountAction,
  regenerateSocialCodeAction,
  removeSocialAccountAction,
  requestSocialReviewAction,
  setDefaultSocialAccountAction,
} from "@/app/actions/accounts";
import { PlatformIcon } from "@/components/admin/platform-icon";
import { Hint } from "@/components/onboarding/hint";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import type { OnboardingDraft, SocialAccount } from "@/lib/db/types";
import { FIELD_HINTS, PLATFORM_LABEL, PLATFORMS } from "@/lib/onboarding/model";
import { formatMoney, formatNumber } from "@/lib/utils";
import type { SocialPlatform } from "@/types/enums";

export type AccountStatView = {
  accountId: string;
  submissions: number;
  views: number;
  earningsCents: number;
};

export function SocialAccountsManager({
  initialAccounts,
  stats = [],
  onDraft,
}: {
  initialAccounts: SocialAccount[];
  stats?: AccountStatView[];
  onDraft?: (draft: OnboardingDraft) => void;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [platform, setPlatform] = useState<SocialPlatform>("tiktok");
  const [handle, setHandle] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const statFor = useMemo(() => {
    const map = new Map(stats.map((stat) => [stat.accountId, stat]));
    return (id: string) => map.get(id);
  }, [stats]);

  function apply(next: SocialAccount, draft: OnboardingDraft | null) {
    setAccounts((current) => {
      const without = current.filter((account) => account.id !== next.id);
      return [...without, next].sort((a, b) => a.platform.localeCompare(b.platform) || a.createdAt.localeCompare(b.createdAt));
    });
    if (draft && onDraft) onDraft(draft);
  }

  function addAccount() {
    setError(null);
    setNotice(null);
    setBusy("add");
    startTransition(async () => {
      const res = await addSocialAccountAction({ platform, handle });
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      apply(res.account, res.draft);
      setHandle("");
      setNotice(`Code ready for @${res.account.handle}. Add it to your bio, then tap I've added it.`);
    });
  }

  function requestReview(accountId: string) {
    setError(null);
    setNotice(null);
    setBusy(accountId);
    startTransition(async () => {
      const res = await requestSocialReviewAction(accountId);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      apply(res.account, res.draft);
      setNotice("Sent for verification. An admin will open the profile and confirm the code.");
    });
  }

  function regenerate(accountId: string) {
    setError(null);
    setNotice(null);
    setBusy(`code-${accountId}`);
    startTransition(async () => {
      const res = await regenerateSocialCodeAction(accountId);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      apply(res.account, null);
      setNotice(`New code for @${res.account.handle}. Add it to your bio, then tap I've added it.`);
    });
  }

  function makeDefault(accountId: string) {
    setError(null);
    setBusy(`default-${accountId}`);
    startTransition(async () => {
      const res = await setDefaultSocialAccountAction(accountId);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAccounts((current) => {
        const target = current.find((account) => account.id === accountId);
        if (!target) return current;
        return current.map((account) =>
          account.platform === target.platform ? { ...account, isDefault: account.id === accountId } : account,
        );
      });
      setNotice("Default account updated.");
    });
  }

  function remove(accountId: string) {
    setError(null);
    setBusy(`remove-${accountId}`);
    startTransition(async () => {
      const res = await removeSocialAccountAction(accountId);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAccounts((current) => current.filter((account) => account.id !== accountId));
      setNotice("Account removed.");
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Add the accounts you post from. Each one stays Pending verification until an admin confirms the bio code.
        </p>
        <Hint text={FIELD_HINTS.bio} label="How checking works" />
      </div>

      <div className="rounded-2xl border border-border bg-white p-3.5">
        <p className="text-sm font-medium">Add an account</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[9rem_1fr_auto]">
          <div>
            <Label htmlFor="account-platform" className="sr-only">
              Platform
            </Label>
            <Select
              id="account-platform"
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
            <Label htmlFor="account-handle" className="sr-only">
              Handle
            </Label>
            <Input
              id="account-handle"
              value={handle}
              placeholder="@handle"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setHandle(event.target.value)}
            />
          </div>
          <Button type="button" variant="secondary" disabled={busy !== null || handle.trim().length < 2} onClick={addAccount}>
            {busy === "add" ? "Adding..." : "Add account"}
          </Button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted">
          No accounts yet. Add one, copy the code into the bio, then tap I&apos;ve added it.
        </p>
      ) : (
        <ul className="space-y-3">
          {accounts.map((account) => {
            const stat = statFor(account.id);
            return (
              <li key={account.id} className="rounded-2xl border border-border bg-white p-3.5">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-surface-2">
                    <PlatformIcon platform={account.platform} />
                  </span>
                  {PLATFORM_LABEL[account.platform]}
                  <span>@{account.handle}</span>
                  {account.isDefault ? (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">Default</span>
                  ) : null}
                  <span
                    className={
                      account.status === "verified"
                        ? "ml-auto rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success"
                        : account.status === "rejected"
                          ? "ml-auto rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger"
                          : "ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted"
                    }
                  >
                    {account.status === "verified"
                      ? "Verified"
                      : account.status === "rejected"
                        ? "Rejected"
                        : "Pending verification"}
                  </span>
                </div>
                <p className="mt-3 font-mono text-sm tracking-wide">{account.code}</p>
                {account.status === "verified" ? (
                  <p className="mt-2 text-sm text-muted">Verified. You can remove the code from your bio.</p>
                ) : account.status === "review" ? (
                  <p className="mt-2 text-sm text-muted">
                    Pending verification. Waiting for an admin to confirm this code on your profile.
                  </p>
                ) : (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
                    <li>Copy this code.</li>
                    <li>Add it to the public bio on {PLATFORM_LABEL[account.platform]}.</li>
                    <li>Tap I&apos;ve added it.</li>
                  </ol>
                )}
                {account.status === "rejected" && account.rejectionReason ? (
                  <p className="mt-2 text-sm text-danger">{account.rejectionReason}</p>
                ) : null}
                {stat ? (
                  <p className="mt-2 text-xs text-muted">
                    {stat.submissions} clips · {formatNumber(stat.views)} views · {formatMoney(stat.earningsCents)} earned
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => copyCode(account.code)}>
                    Copy code
                  </Button>
                  {account.status === "pending" || account.status === "rejected" ? (
                    <Button type="button" size="sm" disabled={busy !== null} onClick={() => requestReview(account.id)}>
                      {busy === account.id ? "Sending..." : "I've added it"}
                    </Button>
                  ) : null}
                  {account.status !== "review" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => regenerate(account.id)}
                    >
                      {busy === `code-${account.id}` ? "Creating..." : "New code"}
                    </Button>
                  ) : null}
                  {!account.isDefault ? (
                    <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => makeDefault(account.id)}>
                      Set default
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => remove(account.id)}>
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}
