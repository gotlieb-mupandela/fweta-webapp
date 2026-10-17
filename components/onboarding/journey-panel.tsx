"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { dismissJourneyAction } from "@/app/actions/journey";
import { Hint } from "@/components/onboarding/hint";
import { Button } from "@/components/ui/button";
import type { JourneyMoment } from "@/lib/onboarding/journey";

export function JourneyPanel({ moment }: { moment: JourneyMoment }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-3xl border border-border bg-white p-4 sm:p-5" aria-labelledby="journey-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-deep">Next step</p>
          <h2 id="journey-title" className="mt-1 font-display text-2xl tracking-tight">
            {moment.title}
          </h2>
        </div>
        <Hint text={moment.help} label="Why this step" />
      </div>
      <ol className="mt-4 space-y-2">
        {moment.steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm leading-relaxed">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={moment.href}>
          <Button size="sm">{moment.cta}</Button>
        </Link>
        <Link href="/help" className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-muted hover:text-foreground">
          Help center
        </Link>
        <button
          type="button"
          className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-muted hover:text-foreground"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await dismissJourneyAction(moment.id);
              router.refresh();
            });
          }}
        >
          Hide this step
        </button>
      </div>
    </section>
  );
}
