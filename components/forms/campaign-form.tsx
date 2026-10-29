"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createCampaignAction, updateCampaignAction } from "@/app/actions/campaigns";
import { PostingGuide } from "@/components/platforms/posting-guide";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { Campaign } from "@/lib/db/types";
import { PLATFORM_LABEL, SOCIAL_PLATFORMS } from "@/lib/social/platforms";
import type { SocialPlatform } from "@/types/enums";

const PLATFORMS: SocialPlatform[] = [...SOCIAL_PLATFORMS];

function nadToCents(value: string) {
  const n = parseFloat(value);
  if (Number.isNaN(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

type Props = {
  mode: "create" | "edit";
  campaign?: Campaign;
  walletAvailableCents?: number;
  budgetLocked?: boolean;
  feeBps?: number;
};

export function CampaignForm({ mode, campaign, walletAvailableCents }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<"publish" | "draft" | null>(null);
  const [pending, startTransition] = useTransition();
  // Tomorrow, computed once. A past end date is refused at publish anyway.
  const [minEndDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(campaign?.platforms ?? []);

  function togglePlatform(p: SocialPlatform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);

        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const publish = submitter instanceof HTMLButtonElement && submitter.value === "publish";
        setIntent(publish ? "publish" : "draft");
        const payload = {
          title: String(fd.get("title") || ""),
          description: String(fd.get("description") || ""),
          type: String(fd.get("type") || "clipping") as "clipping" | "ugc",
          category: String(fd.get("category") || ""),
          budgetTotalCents: nadToCents(String(fd.get("budgetTotal") || "")),
          cpmCents: nadToCents(String(fd.get("cpm") || "")),
          maxPayoutPerSubmissionCents: nadToCents(String(fd.get("maxPayout") || "")),
          platforms,
          requirements: String(fd.get("requirements") || ""),
          endDate: String(fd.get("endDate") || "") || null,
          status: mode === "create" ? (publish ? "active" : "draft") : undefined,
        };

        if (
          mode === "create" &&
          payload.status === "active" &&
          walletAvailableCents !== undefined &&
          payload.budgetTotalCents > walletAvailableCents
        ) {
          setError(
            "This campaign stays hidden until the wallet can cover the full budget. Submit an EFT deposit and wait for admin confirmation, then publish.",
          );
          return;
        }

        startTransition(async () => {
          const res =
            mode === "create"
              ? await createCampaignAction(payload)
              : await updateCampaignAction(campaign!.id, payload);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          if (mode === "create" && "id" in res) {
            router.push(`/dashboard/brand/campaigns/${res.id}`);
          } else {
            router.push(`/dashboard/brand/campaigns/${campaign!.id}`);
          }
          router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required defaultValue={campaign?.title} placeholder="Summer launch clips" />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" required defaultValue={campaign?.description} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="type">Type</Label>
          <Select id="type" name="type" defaultValue={campaign?.type ?? "clipping"}>
            <option value="clipping">Clipping</option>
            <option value="ugc">UGC</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Input id="category" name="category" required defaultValue={campaign?.category} placeholder="Gaming" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="budgetTotal">Total budget (NAD)</Label>
          <Input
            id="budgetTotal"
            name="budgetTotal"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={campaign ? (campaign.budgetTotalCents / 100).toFixed(2) : ""}
            placeholder="1000.00"
          />
        </div>
        <div>
          <Label htmlFor="cpm">CPM (NAD)</Label>
          <Input
            id="cpm"
            name="cpm"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={campaign ? (campaign.cpmCents / 100).toFixed(2) : ""}
            placeholder="50.00"
          />
        </div>
        <div>
          <Label htmlFor="maxPayout">Max per video (NAD)</Label>
          <Input
            id="maxPayout"
            name="maxPayout"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={campaign ? (campaign.maxPayoutPerSubmissionCents / 100).toFixed(2) : ""}
            placeholder="200.00"
          />
        </div>
      </div>
      <div>
        <Label>Platforms</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <label
              key={p}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={platforms.includes(p)}
                onChange={() => togglePlatform(p)}
              />
              {PLATFORM_LABEL[p]}
            </label>
          ))}
        </div>
        {platforms.length > 0 ? (
          <div className="mt-4">
            <PostingGuide platforms={platforms} />
          </div>
        ) : null}
      </div>
      <div>
        <Label htmlFor="requirements">Requirements</Label>
        <Textarea id="requirements" name="requirements" defaultValue={campaign?.requirements} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="endDate">End date (optional)</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            min={mode === "create" ? minEndDate : undefined}
            defaultValue={campaign?.endDate?.slice(0, 10) ?? ""}
          />
        </div>
        {mode === "create" ? (
          <p className="text-sm text-muted sm:col-span-2">
            Clippers only see a published campaign. Publishing moves the full budget from your
            wallet. A draft stays hidden. There is no admin approval step.
          </p>
        ) : null}
      </div>
      <FieldError>{error}</FieldError>
      <div className="flex flex-wrap gap-3">
        {mode === "create" ? (
          <Button type="submit" name="intent" value="publish" disabled={pending || platforms.length === 0}>
            {pending && intent === "publish" ? "Publishing…" : "Publish to clippers"}
          </Button>
        ) : null}
        <Button
          type="submit"
          name="intent"
          value="draft"
          variant={mode === "create" ? "secondary" : "primary"}
          disabled={pending || platforms.length === 0}
        >
          {pending && intent !== "publish" ? "Saving…" : mode === "create" ? "Save as draft" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
