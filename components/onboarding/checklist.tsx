"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { dismissChecklistAction } from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";
import type { ChecklistItem } from "@/lib/onboarding/model";
import { cn } from "@/lib/utils";

export function OnboardingChecklist({
  items,
  percent,
  replayHref,
}: {
  items: ChecklistItem[];
  percent: number;
  replayHref: string;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const done = items.filter((item) => item.status === "done").length;
  const next = items.find((item) => item.status === "open") ?? items.find((item) => item.status === "skipped");

  if (hidden) return null;

  return (
    <section id="onboarding-checklist" aria-label="Setup checklist" className="panel mb-6 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-deep">Setup</p>
          <h2 className="mt-1 font-display text-2xl tracking-tight">
            {done} of {items.length} complete
          </h2>
        </div>
        {next ? (
          <Link href={next.href}>
            <Button size="sm">Continue setup</Button>
          </Link>
        ) : null}
      </div>
      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Setup completion"
      >
        <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${percent}%` }} />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2 text-sm transition hover:border-border-strong"
            >
              <span className="font-medium">{item.title}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  item.status === "done" && "bg-success-soft text-success",
                  item.status === "skipped" && "bg-gold-soft text-gold-deep",
                  item.status === "open" && "bg-surface-2 text-muted",
                )}
              >
                {item.status === "done" ? "Done" : item.status === "skipped" ? "Skipped" : "To do"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={replayHref} className="min-h-11 px-1 text-sm font-medium text-muted underline-offset-2 hover:text-foreground hover:underline">
          Replay tour
        </Link>
        <button
          type="button"
          disabled={pending}
          className="min-h-11 px-1 text-sm font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => {
            startTransition(async () => {
              const res = await dismissChecklistAction();
              if (res.ok) {
                setHidden(true);
                router.refresh();
              }
            });
          }}
        >
          {pending ? "Hiding..." : "Hide checklist"}
        </button>
      </div>
    </section>
  );
}
