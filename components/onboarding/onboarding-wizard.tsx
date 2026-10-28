"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { completeOnboardingAction } from "@/app/actions/onboarding";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  ONBOARDING_SLOW_MESSAGE,
  withOnboardingTimeout,
} from "@/lib/onboarding/submit-timeout";
import {
  clearOnboardingSession,
  onboardingSessionRaw,
  readOnboardingSession,
  subscribeOnboardingSession,
  writeOnboardingSession,
} from "@/lib/onboarding/wizard-session";
import {
  getOnboardingSteps,
  totalOnboardingXp,
  type OnboardingField,
} from "@/lib/onboarding/steps";
import { PLATFORM_LABEL, SOCIAL_PLATFORMS } from "@/lib/social/platforms";
import { cn } from "@/lib/utils";
import type { SocialPlatform, UserRole } from "@/types/enums";

const PLATFORMS: { id: SocialPlatform; label: string }[] = SOCIAL_PLATFORMS.map((id) => ({
  id,
  label: PLATFORM_LABEL[id],
}));

const SOCIAL_FIELDS = [
  "socialTiktok",
  "socialInstagram",
  "socialFacebook",
  "socialYoutube",
  "socialX",
] as const;

type SocialField = (typeof SOCIAL_FIELDS)[number];

type Answers = {
  firstName: string;
  lastName: string;
  phone: string;
  socialTiktok: string;
  socialInstagram: string;
  socialFacebook: string;
  socialYoutube: string;
  socialX: string;
  companyName: string;
  website: string;
  niche: string;
  location: string;
  primaryPlatform: SocialPlatform;
};

type WizardView = {
  index: number;
  xp: number;
  answers: Answers;
};

const INITIAL: Answers = {
  firstName: "",
  lastName: "",
  phone: "",
  socialTiktok: "",
  socialInstagram: "",
  socialFacebook: "",
  socialYoutube: "",
  socialX: "",
  companyName: "",
  website: "",
  niche: "",
  location: "",
  primaryPlatform: "tiktok",
};

const SOCIAL_FINISH_MESSAGE = "Add at least one social profile before finishing.";

function hasAnySocial(answers: Answers): boolean {
  return SOCIAL_FIELDS.some((field) => answers[field].trim().length >= 2);
}

function creatorNeedsSocial(roles: UserRole[]): boolean {
  const creator = roles.includes("influencer") || roles.includes("clipper");
  return creator && !roles.includes("brand");
}

export function OnboardingWizard({
  userId,
  roles,
  initialIndex = 0,
  initialAnswers,
  initialXp = 0,
}: {
  userId: string;
  roles: UserRole[];
  initialIndex?: number;
  initialAnswers?: Answers;
  initialXp?: number;
}) {
  const router = useRouter();
  const steps = useMemo(() => getOnboardingSteps(roles), [roles]);
  const maxXp = useMemo(() => totalOnboardingXp(roles), [roles]);
  const socialRequired = creatorNeedsSocial(roles);
  const sessionRaw = useSyncExternalStore(subscribeOnboardingSession, onboardingSessionRaw, () => "");
  const saved = useMemo(
    () =>
      readOnboardingSession<Answers>(
        {
          getItem: () => (sessionRaw ? sessionRaw : null),
          setItem: () => undefined,
          removeItem: () => undefined,
        },
        userId,
      ),
    [sessionRaw, userId],
  );
  const serverView = useMemo<WizardView>(
    () => ({
      index: clampIndex(initialIndex, steps.length),
      answers: { ...INITIAL, ...initialAnswers },
      xp: initialXp,
    }),
    [initialAnswers, initialIndex, initialXp, steps.length],
  );
  const [draft, setDraft] = useState<WizardView | null>(null);
  const view =
    draft ??
    (saved
      ? {
          index: clampIndex(saved.index, steps.length),
          answers: { ...INITIAL, ...saved.answers },
          xp: saved.xp,
        }
      : serverView);
  const { index, answers, xp } = view;

  const [error, setError] = useState<string | null>(null);
  const [flashXp, setFlashXp] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function remember(next: WizardView) {
    setDraft(next);
    writeOnboardingSession(window.sessionStorage, {
      v: 1,
      userId,
      index: next.index,
      xp: next.xp,
      answers: next.answers,
    });
  }

  const step = steps[index];
  const progress = ((index + (done ? 1 : 0)) / steps.length) * 100;
  const level = xp >= maxXp * 0.75 ? "Pro" : xp >= maxXp * 0.4 ? "Rising" : "Scout";
  const onFinishStep = index >= steps.length - 1;

  function setField<K extends keyof Answers>(key: K, value: Answers[K]) {
    remember({ ...view, answers: { ...view.answers, [key]: value } });
  }

  function validateCurrent(): string | null {
    if (!step) return "Missing step.";
    if (step.optional) return null;
    switch (step.id) {
      case "firstName":
        return answers.firstName.trim() ? null : "Enter your first name.";
      case "lastName":
        return answers.lastName.trim() ? null : "Enter your surname.";
      case "phone":
        return /^[+]?[\d\s()-]{8,24}$/.test(answers.phone.trim())
          ? null
          : "Enter a valid phone number.";
      case "companyName":
        return answers.companyName.trim() ? null : "Enter your business name.";
      case "niche":
        return answers.niche.trim() ? null : "Tell us your niche.";
      case "location":
        return answers.location.trim() ? null : "Add your location.";
      case "primaryPlatform":
        return answers.primaryPlatform ? null : "Pick a platform.";
      case "website":
        return null;
      default:
        return null;
    }
  }

  function payloadFrom(current: Answers) {
    return {
      firstName: current.firstName,
      lastName: current.lastName,
      phone: current.phone,
      socials: {
        tiktok: current.socialTiktok,
        instagram: current.socialInstagram,
        facebook: current.socialFacebook,
        youtube: current.socialYoutube,
        x: current.socialX,
      },
      companyName: current.companyName,
      website: current.website,
      niche: current.niche,
      location: current.location,
      ...(steps.some((item) => item.id === "primaryPlatform")
        ? { primaryPlatform: current.primaryPlatform }
        : {}),
    };
  }

  function goToSocials() {
    const socialIndex = steps.findIndex((item) => SOCIAL_FIELDS.includes(item.id as SocialField));
    if (socialIndex >= 0) remember({ ...view, index: socialIndex });
  }

  function advance() {
    setError(null);
    const validation = validateCurrent();
    if (validation) {
      setError(validation);
      return;
    }

    const earned = step.xp;
    setFlashXp(earned);
    window.setTimeout(() => setFlashXp(null), 900);

    const next = { ...view, xp: view.xp + earned, index: onFinishStep ? view.index : view.index + 1 };
    remember(next);
    if (onFinishStep) finish(next);
  }

  function skip() {
    if (!step?.optional) return;
    setError(null);
    setFlashXp(5);
    window.setTimeout(() => setFlashXp(null), 900);
    const next = { ...view, xp: view.xp + 5, index: onFinishStep ? view.index : view.index + 1 };
    remember(next);
    if (onFinishStep) finish(next);
  }

  function finish(current: WizardView = view) {
    if (socialRequired && !hasAnySocial(current.answers)) {
      setError(SOCIAL_FINISH_MESSAGE);
      return;
    }

    writeOnboardingSession(window.sessionStorage, {
      v: 1,
      userId,
      index: current.index,
      xp: current.xp,
      answers: current.answers,
    });

    startTransition(async () => {
      try {
        const res = await withOnboardingTimeout(completeOnboardingAction(payloadFrom(current.answers)));
        if (!res.ok) {
          setError(res.error);
          return;
        }
        clearOnboardingSession(window.sessionStorage, userId);
        setDone(true);
        window.setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 1200);
      } catch {
        setError(ONBOARDING_SLOW_MESSAGE);
      }
    });
  }

  function renderInput(field: OnboardingField) {
    if (field === "primaryPlatform") {
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLATFORMS.map((platform) => (
            <button
              key={platform.id}
              type="button"
              onClick={() => setField("primaryPlatform", platform.id)}
              className={cn(
                "rounded-2xl border px-3 py-3 text-sm font-medium transition",
                answers.primaryPlatform === platform.id
                  ? "border-foreground bg-foreground text-white"
                  : "border-border bg-white text-muted hover:border-border-strong",
              )}
            >
              {platform.label}
            </button>
          ))}
        </div>
      );
    }

    const key = field as keyof Answers;
    return (
      <div>
        <Label htmlFor={field} className="sr-only">
          {step.title}
        </Label>
        <Input
          id={field}
          type={step.inputType ?? "text"}
          value={String(answers[key] ?? "")}
          onChange={(event) => setField(key, event.target.value as never)}
          placeholder={step.placeholder}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              advance();
            }
          }}
        />
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10 text-center">
        <div className="panel animate-soft-scale space-y-4 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
            Quest complete
          </p>
          <h1 className="font-display text-4xl tracking-tight">You&apos;re in.</h1>
          <p className="text-sm text-muted">
            +{maxXp} XP earned · Rank unlocked:{" "}
            <span className="font-medium text-foreground">{level}</span>
          </p>
          <p className="text-sm text-muted">Taking you to your dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-atmosphere relative min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-6 md:py-10">
        <div className="mb-8 flex items-center justify-between">
          <Logo size="sm" href="/dashboard" />
          <div className="flex items-center gap-2 rounded-full border border-border bg-white/80 px-3 py-1.5 text-xs font-medium">
            <Sparkles className="size-3.5 text-gold" aria-hidden />
            <span>{xp} XP</span>
            <span className="text-muted-light">·</span>
            <span className="text-muted">{level}</span>
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted">
            <span>
              Mission {index + 1} of {steps.length}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-gold transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="panel relative flex-1 animate-fade-up space-y-6 p-6 md:p-8">
          {flashXp ? (
            <span className="absolute right-5 top-5 animate-fade-up rounded-full bg-gold-soft px-2.5 py-1 text-xs font-semibold text-gold-deep">
              +{flashXp} XP
            </span>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
              Setup quest
            </p>
            <h1 className="font-display text-[2.1rem] leading-[1.15] tracking-tight md:text-4xl">
              {step.title}
            </h1>
            <p className="text-sm leading-relaxed text-muted">{step.subtitle}</p>
          </div>

          {renderInput(step.id)}

          {onFinishStep && socialRequired ? (
            <p className="text-sm leading-relaxed text-muted">
              At least one social profile is required to finish. You can skip the networks you do not use.
            </p>
          ) : null}

          <FieldError>{error}</FieldError>

          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <Button
              type="button"
              size="lg"
              className="sm:flex-1"
              disabled={pending}
              onClick={advance}
            >
              {pending ? "Saving…" : onFinishStep ? "Finish" : "Continue"}
            </Button>
            {error === SOCIAL_FINISH_MESSAGE ? (
              <Button type="button" size="lg" variant="secondary" disabled={pending} onClick={goToSocials}>
                Add a social profile
              </Button>
            ) : null}
            {step.optional ? (
              <Button type="button" size="lg" variant="secondary" disabled={pending} onClick={skip}>
                Skip
              </Button>
            ) : null}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-light">
          One question at a time · tailored to your dashboard
        </p>
      </div>
    </div>
  );
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), length - 1);
}
