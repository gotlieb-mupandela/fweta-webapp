"use client";

import { useState, useTransition } from "react";

import { saveOnboardingCampaignAction } from "@/app/actions/onboarding";
import { Hint } from "@/components/onboarding/hint";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { CREATOR_INTERESTS, FIELD_HINTS, PLATFORM_LABEL, PLATFORMS } from "@/lib/onboarding/model";
import { cn } from "@/lib/utils";
import type { CampaignType, SocialPlatform } from "@/types/enums";

export type CampaignDefaults = {
  title: string;
  brief: string;
  rules: string;
  type: CampaignType;
  category: string;
  budgetNad: string;
  cpmNad: string;
  maxPayoutNad: string;
  minViews: string;
  platforms: SocialPlatform[];
};

type Result = Awaited<ReturnType<typeof saveOnboardingCampaignAction>>;

function FieldLabel({ htmlFor, label, hint }: { htmlFor: string; label: string; hint: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <Label htmlFor={htmlFor} className="mb-0">
        {label}
      </Label>
      <Hint text={hint} />
    </div>
  );
}

export function CampaignStep({
  defaults,
  onResult,
}: {
  defaults: CampaignDefaults | null;
  onResult: (result: Result) => void;
}) {
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(defaults?.platforms ?? ["tiktok"]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(platform: SocialPlatform) {
    setPlatforms((current) =>
      current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform],
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const budgetNad = Number(form.get("budgetNad"));
        const cpmNad = Number(form.get("cpmNad"));
        const maxPayoutNad = Number(form.get("maxPayoutNad"));
        const minViews = Number(form.get("minViews"));
        if (platforms.length < 1) {
          setError("Pick at least one platform.");
          return;
        }
        setError(null);
        startTransition(async () => {
          const res = await saveOnboardingCampaignAction({
            title: String(form.get("title") || ""),
            brief: String(form.get("brief") || ""),
            rules: String(form.get("rules") || ""),
            type: String(form.get("type") || "clipping") as CampaignType,
            category: String(form.get("category") || ""),
            budgetNad,
            cpmNad,
            maxPayoutNad,
            minViews,
            platforms,
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          onResult(res);
        });
      }}
    >
      <div>
        <Label htmlFor="title">Campaign title</Label>
        <Input id="title" name="title" required minLength={3} defaultValue={defaults?.title} placeholder="Spring launch clips" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="type">Type</Label>
          <Select id="type" name="type" defaultValue={defaults?.type ?? "clipping"}>
            <option value="clipping">Clipping</option>
            <option value="ugc">Original content</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Select id="category" name="category" defaultValue={defaults?.category || CREATOR_INTERESTS[0]}>
            {CREATOR_INTERESTS.map((interest) => (
              <option key={interest} value={interest}>
                {interest}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="cpmNad" label="Rate per 1,000 views (N$)" hint={FIELD_HINTS.cpm} />
          <Input id="cpmNad" name="cpmNad" type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={defaults?.cpmNad} placeholder="40.00" />
        </div>
        <div>
          <FieldLabel htmlFor="budgetNad" label="Budget (N$)" hint={FIELD_HINTS.budget} />
          <Input id="budgetNad" name="budgetNad" type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={defaults?.budgetNad} placeholder="5000.00" />
        </div>
        <div>
          <FieldLabel htmlFor="minViews" label="Minimum views" hint={FIELD_HINTS.minViews} />
          <Input id="minViews" name="minViews" type="number" inputMode="numeric" min="0" step="1" required defaultValue={defaults?.minViews ?? "1000"} />
        </div>
        <div>
          <FieldLabel htmlFor="maxPayoutNad" label="Per-clip cap (N$)" hint={FIELD_HINTS.cap} />
          <Input id="maxPayoutNad" name="maxPayoutNad" type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={defaults?.maxPayoutNad} placeholder="250.00" />
        </div>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Platforms</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLATFORMS.map((platform) => {
            const active = platforms.includes(platform);
            return (
              <button
                key={platform}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(platform)}
                className={cn(
                  "min-h-11 rounded-2xl border px-3 py-2 text-sm font-medium transition",
                  active ? "border-foreground bg-foreground text-white" : "border-border bg-white text-muted hover:border-border-strong",
                )}
              >
                {PLATFORM_LABEL[platform]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div>
        <Label htmlFor="brief">Brief</Label>
        <Textarea id="brief" name="brief" required minLength={10} defaultValue={defaults?.brief} placeholder="What should creators cut or film, and what must stay on screen?" />
      </div>
      <div>
        <Label htmlFor="rules">Rules</Label>
        <Textarea id="rules" name="rules" required minLength={3} defaultValue={defaults?.rules} placeholder="No paid ads. Credit the brand. Keep the logo visible." />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save draft campaign"}
      </Button>
    </form>
  );
}
