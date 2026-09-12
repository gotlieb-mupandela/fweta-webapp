"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { completeOnboardingAction } from "@/app/actions/onboarding";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  getOnboardingSteps,
  totalOnboardingXp,
  type OnboardingField,
} from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";
import type { SocialPlatform, UserRole } from "@/types/enums";

const PLATFORMS: { id: SocialPlatform; label: string }[] = [
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "x", label: "X" },
];

type Answers = {
  firstName: string;
  lastName: string;
  phone: string;
  socialPlatform: SocialPlatform;
  socialHandle: string;
  companyName: string;
  website: string;
  niche: string;
  location: string;
  primaryPlatform: SocialPlatform;
};

const INITIAL: Answers = {
  firstName: "",
  lastName: "",
  phone: "",
  socialPlatform: "tiktok",
  socialHandle: "",
  companyName: "",
  website: "",
  niche: "",
  location: "",
  primaryPlatform: "tiktok",
};

export function OnboardingWizard({ roles }: { roles: UserRole[] }) {
  const router = useRouter();
  const steps = useMemo(() => getOnboardingSteps(roles), [roles]);
  const maxXp = useMemo(() => totalOnboardingXp(roles), [roles]);

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(INITIAL);
  const [xp, setXp] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [flashXp, setFlashXp] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const step = steps[index];
  const progress = ((index + (done ? 1 : 0)) / steps.length) * 100;
  const level =
    xp >= maxXp * 0.75 ? "Pro" : xp >= maxXp * 0.4 ? "Rising" : "Scout";

  function setField<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
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
      case "social":
        return answers.socialHandle.trim().length >= 2
          ? null
          : "Add your handle or profile link.";
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

  function advance() {
    setError(null);
    const validation = validateCurrent();
    if (validation) {
      setError(validation);
      return;
    }

    const earned = step.xp;
    setXp((v) => v + earned);
    setFlashXp(earned);
    window.setTimeout(() => setFlashXp(null), 900);

    if (index >= steps.length - 1) {
      finish();
      return;
    }
    setIndex((i) => i + 1);
  }

  function skip() {
    if (!step?.optional) return;
    setFlashXp(5);
    setXp((v) => v + 5);
    window.setTimeout(() => setFlashXp(null), 900);
    if (index >= steps.length - 1) {
      finish();
      return;
    }
    setIndex((i) => i + 1);
  }

  function finish() {
    startTransition(async () => {
      const res = await completeOnboardingAction(answers);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
      window.setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1200);
    });
  }

  function renderInput(field: OnboardingField) {
    if (field === "social") {
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setField("socialPlatform", p.id)}
                className={cn(
                  "rounded-2xl border px-3 py-3 text-sm font-medium transition",
                  answers.socialPlatform === p.id
                    ? "border-foreground bg-foreground text-white"
                    : "border-border bg-white text-muted hover:border-border-strong",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="socialHandle">Handle or profile URL</Label>
            <Input
              id="socialHandle"
              value={answers.socialHandle}
              onChange={(e) => setField("socialHandle", e.target.value)}
              placeholder="@yourhandle"
              autoFocus
            />
          </div>
        </div>
      );
    }

    if (field === "primaryPlatform") {
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setField("primaryPlatform", p.id)}
              className={cn(
                "rounded-2xl border px-3 py-3 text-sm font-medium transition",
                answers.primaryPlatform === p.id
                  ? "border-foreground bg-foreground text-white"
                  : "border-border bg-white text-muted hover:border-border-strong",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      );
    }

    const key = field as keyof Answers;
    return (
      <div>
        <Label htmlFor={field}>{step.title.replace("?", "")}</Label>
        <Input
          id={field}
          type={step.inputType ?? "text"}
          value={String(answers[key] ?? "")}
          onChange={(e) => setField(key, e.target.value as never)}
          placeholder={step.placeholder}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
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
            <h1 className="font-display text-[2.1rem] leading-none tracking-tight md:text-4xl">
              {step.title}
            </h1>
            <p className="text-sm leading-relaxed text-muted">{step.subtitle}</p>
          </div>

          {renderInput(step.id)}

          <FieldError>{error}</FieldError>

          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <Button
              type="button"
              size="lg"
              className="sm:flex-1"
              disabled={pending}
              onClick={advance}
            >
              {pending
                ? "Saving…"
                : index >= steps.length - 1
                  ? `Finish · +${step.xp} XP`
                  : `Continue · +${step.xp} XP`}
            </Button>
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
