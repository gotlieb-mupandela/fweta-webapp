"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createCampaignAction, updateCampaignAction } from "@/app/actions/campaigns";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { Campaign } from "@/lib/db/types";
import type { SocialPlatform } from "@/types/enums";

const PLATFORMS: SocialPlatform[] = ["tiktok", "youtube", "instagram", "x"];

function nadToCents(value: string) {
  const n = parseFloat(value);
  if (Number.isNaN(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

type Props = {
  mode: "create" | "edit";
  campaign?: Campaign;
};

export function CampaignForm({ mode, campaign }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
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
          status: mode === "create" ? (String(fd.get("status") || "draft") as Campaign["status"]) : undefined,
        };

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
              {p}
            </label>
          ))}
        </div>
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
            defaultValue={campaign?.endDate?.slice(0, 10) ?? ""}
          />
        </div>
        {mode === "create" ? (
          <div>
            <Label htmlFor="status">Initial status</Label>
            <Select id="status" name="status" defaultValue="draft">
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
            </Select>
          </div>
        ) : null}
      </div>
      <FieldError>{error}</FieldError>
      <div className="flex gap-3">
        <Button type="submit" disabled={pending || platforms.length === 0}>
          {pending ? "Saving…" : mode === "create" ? "Create campaign" : "Save changes"}
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
