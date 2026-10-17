"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  exitOnboardingAction,
  saveOnboardingStepAction,
} from "@/app/actions/onboarding";
import { Logo } from "@/components/brand/logo";
import { CampaignStep, type CampaignDefaults } from "@/components/onboarding/campaign-step";
import { CompanyStep } from "@/components/onboarding/company-step";
import { PayoutStep } from "@/components/onboarding/payout-step";
import { SocialStep } from "@/components/onboarding/social-step";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import type { OnboardingDraft, OnboardingStepId } from "@/lib/db/types";
import {
  CREATOR_INTERESTS,
  STEP_COPY,
  isBrandRole,
  isCreatorRole,
  stepIdsFor,
  tourBeats,
  type DepositInstructions,
  type RecommendableCampaign,
} from "@/lib/onboarding/model";
import { cn, formatMoney } from "@/lib/utils";
import type { UserRole } from "@/types/enums";

export type OnboardingBoot = {
  roles: UserRole[];
  primaryRole: UserRole;
  email: string;
  draft: OnboardingDraft;
  initialStepId: OnboardingStepId;
  avatarUrl: string | null;
  campaigns: RecommendableCampaign[];
  deposit: DepositInstructions;
  hasPayout: boolean;
  campaignDefaults: CampaignDefaults | null;
};

type StepResult = Awaited<ReturnType<typeof saveOnboardingStepAction>>;

export function OnboardingWizard({ boot }: { boot: OnboardingBoot }) {
  const router = useRouter();
  const stepIds = useMemo(
    () => stepIdsFor(boot.roles, boot.primaryRole),
    [boot.roles, boot.primaryRole],
  );
  const [draft, setDraft] = useState(boot.draft);
  const [stepId, setStepId] = useState<OnboardingStepId>(boot.initialStepId);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const index = Math.max(0, stepIds.indexOf(stepId));
  const copy = STEP_COPY[stepId];
  const progress = Math.round(((index + 1) / stepIds.length) * 100);
  const creator = isCreatorRole(boot.roles);
  const brand = isBrandRole(boot.roles);
  const panelOwnsPrimary = stepId === "payout" || stepId === "campaign";
  const eyebrow = brand && creator ? "Account setup" : brand ? "Business setup" : "Creator setup";

  useEffect(() => {
    headingRef.current?.focus();
  }, [stepId]);

  function handleResult(result: StepResult) {
    if (!result.ok) {
      setError(result.error);
      if (result.draft) setDraft(result.draft);
      return;
    }
    setError(null);
    setDraft(result.draft);
    if (result.done) {
      setDone(true);
      window.setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 900);
      return;
    }
    setStepId(result.nextStepId);
  }

  function continueStep() {
    setError(null);
    startTransition(async () => {
      const result = await saveOnboardingStepAction(payloadFor(stepId, draft, "complete"));
      handleResult(result);
    });
  }

  function skipStep() {
    setError(null);
    startTransition(async () => {
      const result = await saveOnboardingStepAction({ stepId, mode: "skip" });
      handleResult(result);
    });
  }

  function exitSetup() {
    setError(null);
    startTransition(async () => {
      const result = await exitOnboardingAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="bg-atmosphere flex min-h-dvh items-center justify-center px-5 py-10">
        <div className="panel w-full max-w-md space-y-3 p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">Setup saved</p>
          <h1 className="font-display text-4xl tracking-tight">You&apos;re in.</h1>
          <p className="text-sm leading-relaxed text-muted">
            Your workspace is ready. Anything you skipped stays on the checklist.
          </p>
          <Button type="button" onClick={() => router.push("/dashboard")}>
            Go to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-atmosphere min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-5 sm:px-6 md:py-10">
        <header className="mb-6 flex items-center justify-between gap-3">
          <Logo size="sm" href="/dashboard" />
          <button
            type="button"
            onClick={exitSetup}
            disabled={pending}
            className="min-h-11 rounded-full px-3 text-sm font-medium text-muted transition hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Save and exit
          </button>
        </header>

        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted">
            <span>
              Step {index + 1} of {stepIds.length}
            </span>
            <span>{progress}%</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Setup progress"
          >
            <div className="h-full rounded-full bg-gold transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="panel flex flex-1 flex-col p-5 sm:p-7">
          <div key={stepId} className="animate-fade-up flex flex-1 flex-col">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">{eyebrow}</p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 font-display text-[2rem] leading-[1.12] tracking-tight outline-none sm:text-4xl"
            >
              {copy.title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">{copy.subtitle}</p>

            <div className="mt-6 flex-1">
              <StepBody
                stepId={stepId}
                draft={draft}
                setDraft={setDraft}
                boot={boot}
                creator={creator}
                brand={brand}
                onResult={handleResult}
              />
            </div>

            <div role="alert">
              <FieldError>{error}</FieldError>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending || index === 0}
                  onClick={() => {
                    setError(null);
                    setStepId(stepIds[index - 1] ?? stepId);
                  }}
                >
                  Back
                </Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={skipStep}>
                  Skip for now
                </Button>
              </div>
              {panelOwnsPrimary ? null : (
                <Button type="button" className="sm:min-w-40" disabled={pending} onClick={continueStep}>
                  {pending ? "Saving..." : copy.nextLabel}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function payloadFor(stepId: OnboardingStepId, draft: OnboardingDraft, mode: "complete" | "skip") {
  if (stepId === "name") {
    return { stepId, mode, firstName: draft.firstName, lastName: draft.lastName, phone: draft.phone };
  }
  if (stepId === "interests") {
    return { stepId, mode, interests: draft.interests, location: draft.location };
  }
  if (stepId === "socials") {
    return {
      stepId,
      mode,
      socials: {
        tiktok: draft.checks.find((item) => item.platform === "tiktok")?.handle ?? draft.socials.tiktok ?? "",
        instagram: draft.checks.find((item) => item.platform === "instagram")?.handle ?? "",
        youtube: draft.checks.find((item) => item.platform === "youtube")?.handle ?? "",
        x: draft.checks.find((item) => item.platform === "x")?.handle ?? "",
      },
    };
  }
  if (stepId === "company") {
    return {
      stepId,
      mode,
      companyName: draft.companyName,
      website: draft.website,
      brandSocials: {
        tiktok: draft.brandSocials.tiktok ?? "",
        instagram: draft.brandSocials.instagram ?? "",
        youtube: draft.brandSocials.youtube ?? "",
        x: draft.brandSocials.x ?? "",
      },
    };
  }
  if (stepId === "promote") return { stepId, mode, promote: draft.promote };
  return { stepId, mode };
}

function StepBody({
  stepId,
  draft,
  setDraft,
  boot,
  creator,
  brand,
  onResult,
}: {
  stepId: OnboardingStepId;
  draft: OnboardingDraft;
  setDraft: (draft: OnboardingDraft) => void;
  boot: OnboardingBoot;
  creator: boolean;
  brand: boolean;
  onResult: (result: StepResult) => void;
}) {
  if (stepId === "name") {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            autoComplete="given-name"
            value={draft.firstName}
            onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="lastName">Surname</Label>
          <Input
            id="lastName"
            autoComplete="family-name"
            value={draft.lastName}
            onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+264 81 000 0000"
            value={draft.phone}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
          />
        </div>
      </div>
    );
  }

  if (stepId === "interests") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Topics">
          {CREATOR_INTERESTS.map((interest) => {
            const active = draft.interests.includes(interest);
            return (
              <button
                key={interest}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  const interests = active
                    ? draft.interests.filter((item) => item !== interest)
                    : draft.interests.length >= 5
                      ? draft.interests
                      : [...draft.interests, interest];
                  setDraft({ ...draft, interests });
                }}
                className={cn(
                  "min-h-11 rounded-full border px-3.5 text-sm font-medium transition",
                  active ? "border-foreground bg-foreground text-white" : "border-border bg-white text-foreground hover:border-border-strong",
                )}
              >
                {interest}
              </button>
            );
          })}
        </div>
        <div>
          <Label htmlFor="location">Where are you based? (optional)</Label>
          <Input
            id="location"
            value={draft.location}
            placeholder="Windhoek, Namibia"
            onChange={(event) => setDraft({ ...draft, location: event.target.value })}
          />
        </div>
      </div>
    );
  }

  if (stepId === "socials") {
    return <SocialStep draft={draft} onDraft={setDraft} />;
  }

  if (stepId === "payout") {
    return <PayoutStep hasPayout={boot.hasPayout || draft.payoutSaved} onResult={onResult} />;
  }

  if (stepId === "company") {
    return (
      <CompanyStep
        draft={draft}
        avatarUrl={boot.avatarUrl}
        onChange={(patch) => setDraft({ ...draft, ...patch })}
      />
    );
  }

  if (stepId === "promote") {
    return (
      <div>
        <Label htmlFor="promote">In your words</Label>
        <Textarea
          id="promote"
          value={draft.promote}
          placeholder="We are launching a new rooibos cold brew and need short clips for TikTok and Reels."
          onChange={(event) => setDraft({ ...draft, promote: event.target.value })}
        />
      </div>
    );
  }

  if (stepId === "campaign") {
    return <CampaignStep defaults={boot.campaignDefaults} onResult={onResult} />;
  }

  if (stepId === "deposit") {
    return <DepositPanel deposit={boot.deposit} />;
  }

  if (stepId === "tour") {
    const beats = tourBeats(boot.primaryRole, creator, brand);
    return (
      <ol className="space-y-3">
        {beats.slice(0, 3).map((beat, beatIndex) => (
          <li key={beat.id} className="rounded-2xl border border-border bg-white px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-deep">
              {beatIndex + 1}
            </p>
            <p className="mt-1 font-medium">{beat.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{beat.body}</p>
          </li>
        ))}
      </ol>
    );
  }

  const recommended = recommendClient(boot.campaigns, draft.interests);
  if (recommended.length === 0) {
    return (
      <div className="empty-panel">
        <h2 className="font-display text-2xl tracking-tight">No live campaigns yet</h2>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          When a brand launches a campaign, it will show up here and on your campaign board. You can still open the workspace and come back.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {recommended.map((campaign) => (
        <li key={campaign.id} className="rounded-2xl border border-border bg-white px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{campaign.title}</p>
              <p className="mt-1 text-xs text-muted">
                {campaign.category} · {campaign.type === "ugc" ? "Original" : "Clipping"} · {formatMoney(campaign.cpmCents)} / 1,000 views
              </p>
            </div>
            <a
              href={`/campaigns/${campaign.id}`}
              className="shrink-0 text-sm font-medium text-gold-deep underline-offset-2 hover:underline"
            >
              View
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

function recommendClient(campaigns: RecommendableCampaign[], interests: string[]) {
  const needles = interests.map((item) => item.toLowerCase());
  return [...campaigns]
    .filter((campaign) => campaign.status === "active" && campaign.budgetRemainingCents > 0)
    .sort((a, b) => {
      const score = (campaign: RecommendableCampaign) =>
        needles.reduce((total, needle) => total + (`${campaign.title} ${campaign.category}`.toLowerCase().includes(needle) ? 1 : 0), 0);
      return score(b) - score(a);
    })
    .slice(0, 4);
}

function DepositPanel({ deposit }: { deposit: DepositInstructions }) {
  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {deposit.steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm leading-relaxed">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gold-soft text-xs font-semibold text-gold-deep">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="rounded-2xl border border-border bg-surface-2/50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Your reference</p>
        <p className="mt-1 font-mono text-xl tracking-wide">{deposit.reference}</p>
        {deposit.configured ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Bank</dt>
              <dd>{deposit.bankName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Account name</dt>
              <dd>{deposit.accountName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Account number</dt>
              <dd className="font-mono">{deposit.accountNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Branch code</dt>
              <dd className="font-mono">{deposit.branchCode}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The receiving account is issued by the Fweta team. Send them this reference with your proof of payment.
          </p>
        )}
      </div>
    </div>
  );
}
