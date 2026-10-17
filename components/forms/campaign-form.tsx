"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createCampaignAction, updateCampaignAction } from "@/app/actions/campaigns";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { Campaign } from "@/lib/db/types";
import {
  DEFAULT_COUNTRY_CODES,
  DEFAULT_MIN_VIEWS,
  PLATFORM_LABEL,
  SADC_COUNTRIES,
  feeReserveForBudget,
} from "@/lib/rewards/content-rewards";
import { campaignCreateSchema, campaignUpdateSchema } from "@/lib/validations/campaign";
import type { SocialPlatform } from "@/types/enums";

const PLATFORMS: SocialPlatform[] = ["tiktok", "instagram", "youtube", "x"];

function nadToCents(value: string) {
  const n = parseFloat(value);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

type AssetRow = { label: string; url: string };

type Props = {
  mode: "create" | "edit";
  campaign?: Campaign;
  walletAvailableCents?: number;
  budgetLocked?: boolean;
};

export function CampaignForm({ mode, campaign, walletAvailableCents, budgetLocked }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(
    campaign?.platforms ?? ["tiktok", "instagram", "youtube"],
  );
  const [assets, setAssets] = useState<AssetRow[]>(
    campaign?.assets?.map((asset) => ({ label: asset.label, url: asset.url })) ?? [
      { label: "", url: "" },
    ],
  );
  const [countries, setCountries] = useState<string[]>(campaign?.countries ?? [...DEFAULT_COUNTRY_CODES]);
  const [payModel, setPayModel] = useState<"cpm" | "pool">(campaign?.payModel ?? "cpm");

  function togglePlatform(platform: SocialPlatform) {
    setPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((item) => item !== platform) : [...prev, platform],
    );
  }

  return (
    <form
      className="max-w-2xl space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);

        const fields = {
          title: String(fd.get("title") || ""),
          description: String(fd.get("description") || ""),
          type: String(fd.get("type") || "clipping") as "clipping" | "ugc",
          category: String(fd.get("category") || ""),
          budgetTotalCents: nadToCents(String(fd.get("budgetTotal") || "")),
          cpmCents: nadToCents(String(fd.get("cpm") || "")),
          minPayoutCents: nadToCents(String(fd.get("minPayout") || "0")),
          minViews: Math.max(0, Math.round(Number(fd.get("minViews") || DEFAULT_MIN_VIEWS))),
          payModel,
          countries,
          maxPayoutPerSubmissionCents: nadToCents(String(fd.get("maxPayout") || "")),
          platforms,
          requirements: String(fd.get("requirements") || ""),
          rules: String(fd.get("rules") || ""),
          assets: assets
            .map((row) => ({ label: row.label.trim(), url: row.url.trim() }))
            .filter((row) => row.label || row.url),
          startDate: String(fd.get("startDate") || "") || null,
          endDate: String(fd.get("endDate") || "") || null,
          status:
            mode === "create"
              ? (String(fd.get("status") || "draft") as Campaign["status"])
              : undefined,
        };
        const payload =
          mode === "create"
            ? {
                ...fields,
                status: String(fd.get("status") || "draft") as Campaign["status"],
              }
            : fields;

        const parsed = (
          mode === "create" ? campaignCreateSchema : campaignUpdateSchema
        ).safeParse(payload);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Invalid campaign details.");
          return;
        }

        if (payload.platforms.length === 0) {
          setError("Choose at least one platform.");
          return;
        }
        if (payload.countries.length === 0) {
          setError("Choose at least one country.");
          return;
        }
        if (payload.payModel === "pool" && !payload.endDate) {
          setError("A pool campaign needs an end date.");
          return;
        }
        if (payload.payModel === "cpm" && payload.cpmCents <= 0) {
          setError("Set the rate per 1,000 views.");
          return;
        }
        if (payload.assets.some((row) => !row.label || !row.url)) {
          setError("Each reference needs a label and a link, or leave the row empty.");
          return;
        }
        if (
          mode === "create" &&
          parsed.data.status === "active" &&
          walletAvailableCents !== undefined &&
          payload.budgetTotalCents + feeReserveForBudget(payload.budgetTotalCents) > walletAvailableCents
        ) {
          setError("Insufficient wallet balance for this budget plus the fee set-aside. Record a deposit first.");
          return;
        }

        startTransition(async () => {
          const res =
            mode === "create"
              ? await createCampaignAction(parsed.data)
              : await updateCampaignAction(campaign!.id, parsed.data);
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
      <section className="space-y-4">
        <header>
          <h2 className="font-display text-2xl tracking-tight">The offer</h2>
          <p className="mt-1 text-sm text-muted">Creators see this on Discover before they open the rules.</p>
        </header>
        <div>
          <Label htmlFor="title">Campaign name</Label>
          <Input id="title" name="title" required defaultValue={campaign?.title} placeholder="Podcast cuts, Windhoek" />
        </div>
        <div>
          <Label htmlFor="description">What should they make?</Label>
          <Textarea
            id="description"
            name="description"
            required
            defaultValue={campaign?.description}
            placeholder="Cut 20 to 40 second vertical clips from the interview. Lead with the hook."
          />
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
            <Input id="category" name="category" required defaultValue={campaign?.category} placeholder="Music" />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="font-display text-2xl tracking-tight">Pay per 1,000 views</h2>
          <p className="mt-1 text-sm text-muted">
            The rate on the card is what the clipper receives. Fweta sets aside 10% of the budget as a platform fee and charges it only on views that are paid. Unused fee comes back when the campaign ends.
          </p>
        </header>
        <div>
          <Label htmlFor="payModel">Pay model</Label>
          <Select
            id="payModel"
            value={payModel}
            onChange={(e) => setPayModel(e.target.value as "cpm" | "pool")}
            disabled={budgetLocked}
          >
            <option value="cpm">CPM, per 1,000 verified views</option>
            <option value="pool">Pool, split the budget at the end</option>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="budgetTotal">Budget (NAD)</Label>
            <Input
              id="budgetTotal"
              name="budgetTotal"
              type="number"
              step="0.01"
              min="0.01"
              required
              readOnly={budgetLocked}
              defaultValue={campaign ? (campaign.budgetTotalCents / 100).toFixed(2) : ""}
              placeholder="5000.00"
            />
            {budgetLocked ? (
              <p className="mt-1 text-xs text-muted">Budget is locked once it has been reserved from your wallet.</p>
            ) : (
              <p className="mt-1 text-xs text-muted">This full amount is reserved before the campaign can go public.</p>
            )}
          </div>
          <div>
            <Label htmlFor="cpm">Clipper rate per 1,000 views (NAD)</Label>
            <Input
              id="cpm"
              name="cpm"
              type="number"
              step="0.01"
              min="0"
              required={payModel === "cpm"}
              defaultValue={campaign ? (campaign.cpmCents / 100).toFixed(2) : ""}
              placeholder="40.00"
            />
          </div>
          <div>
            <Label htmlFor="minViews">View floor</Label>
            <Input
              id="minViews"
              name="minViews"
              type="number"
              min="0"
              step="1"
              readOnly={budgetLocked}
              defaultValue={campaign ? String(campaign.minViews) : String(DEFAULT_MIN_VIEWS)}
            />
            <p className="mt-1 text-xs text-muted">
              {budgetLocked
                ? "The view floor is frozen once the campaign is live."
                : "Qualified views before review. Default is low. Set 0 to review any clip."}
            </p>
          </div>
          <div>
            <Label htmlFor="minPayout">Minimum before review (NAD)</Label>
            <Input
              id="minPayout"
              name="minPayout"
              type="number"
              step="0.01"
              min="0"
              defaultValue={campaign ? (campaign.minPayoutCents / 100).toFixed(2) : "0.00"}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="maxPayout">Max per post (NAD)</Label>
            <Input
              id="maxPayout"
              name="maxPayout"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={campaign ? (campaign.maxPayoutPerSubmissionCents / 100).toFixed(2) : ""}
              placeholder="250.00"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="font-display text-2xl tracking-tight">Platforms</h2>
        </header>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((platform) => {
            const on = platforms.includes(platform);
            return (
              <button
                key={platform}
                type="button"
                onClick={() => togglePlatform(platform)}
                className={
                  on
                    ? "rounded-full bg-foreground px-3.5 py-2 text-sm text-white"
                    : "rounded-full border border-border bg-white px-3.5 py-2 text-sm text-muted"
                }
                aria-pressed={on}
              >
                {PLATFORM_LABEL[platform]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="font-display text-2xl tracking-tight">Brief and rules</h2>
          <p className="mt-1 text-sm text-muted">
            The brief is the ask. Rules are what you can reject against.
          </p>
        </header>
        <div>
          <Label htmlFor="requirements">Content requirements</Label>
          <Textarea
            id="requirements"
            name="requirements"
            defaultValue={campaign?.requirements}
            placeholder="Vertical 9:16. Use the footage links. Caption the artist name."
          />
        </div>
        <div>
          <Label htmlFor="rules">Caption and disclosure rules</Label>
          <Textarea
            id="rules"
            name="rules"
            defaultValue={campaign?.rules}
            placeholder={"One rule per line.\nNo other brands on screen.\nPost must stay public."}
          />
        </div>
        <div className="space-y-3">
          <Label>Reference links</Label>
          {assets.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_auto]">
              <Input
                aria-label={`Reference ${index + 1} label`}
                value={row.label}
                placeholder="Footage folder"
                onChange={(e) =>
                  setAssets((prev) =>
                    prev.map((item, i) => (i === index ? { ...item, label: e.target.value } : item)),
                  )
                }
              />
              <Input
                aria-label={`Reference ${index + 1} URL`}
                value={row.url}
                placeholder="https://"
                inputMode="url"
                onChange={(e) =>
                  setAssets((prev) =>
                    prev.map((item, i) => (i === index ? { ...item, url: e.target.value } : item)),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAssets((prev) => prev.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
          {assets.length < 8 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAssets((prev) => [...prev, { label: "", url: "" }])}
            >
              Add a link
            </Button>
          ) : null}
        </div>
        {platforms.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Select at least one platform.</p>
        ) : null}
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="font-display text-2xl tracking-tight">Countries</h2>
          <p className="mt-1 text-sm text-muted">
            Views are counted for these countries. New campaigns start with Namibia and SADC.
          </p>
        </header>
        <div className="flex flex-wrap gap-2">
          {SADC_COUNTRIES.map((country) => {
            const on = countries.includes(country.code);
            return (
              <button
                key={country.code}
                type="button"
                onClick={() =>
                  setCountries((prev) =>
                    prev.includes(country.code)
                      ? prev.filter((code) => code !== country.code)
                      : [...prev, country.code],
                  )
                }
                className={
                  on
                    ? "rounded-full bg-foreground px-3 py-1.5 text-xs text-white"
                    : "rounded-full border border-border bg-white px-3 py-1.5 text-xs text-muted"
                }
                aria-pressed={on}
              >
                {country.name}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="font-display text-2xl tracking-tight">Schedule</h2>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="startDate">Start</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={campaign?.startDate?.slice(0, 10) ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="endDate">End</Label>
            <Input
              id="endDate"
              name="endDate"
              type="date"
              defaultValue={campaign?.endDate?.slice(0, 10) ?? ""}
            />
          </div>
        </div>
        {mode === "create" ? (
          <div>
            <Label htmlFor="status">Launch</Label>
            <Select id="status" name="status" defaultValue="draft">
              <option value="draft">Save as draft</option>
              <option value="active">Fund and go live</option>
            </Select>
            <p className="mt-1 text-xs text-muted">
              Going live reserves the full budget, plus a 10% fee set-aside, from your wallet. The campaign stays off Discover until that reservation succeeds. Payouts are manual Namibian EFT. No card checkout and no crypto.
            </p>
          </div>
        ) : null}
      </section>

      <FieldError>{error}</FieldError>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={pending || platforms.length === 0}>
          {pending ? "Saving…" : mode === "create" ? "Create campaign" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
