"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { markProductTourSeenAction } from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";
import { tourBeats, type TourBeat } from "@/lib/onboarding/model";
import type { UserRole } from "@/types/enums";

export function ProductTour({
  role,
  creator,
  brand,
  enabled,
}: {
  role: UserRole;
  creator: boolean;
  brand: boolean;
  enabled: boolean;
}) {
  const params = useSearchParams();
  const forced = params.get("tour") === "1";
  const beats = tourBeats(role, creator, brand);
  if (!enabled && !forced) return null;
  return <TourDialog beats={beats} />;
}

function TourDialog({ beats }: { beats: TourBeat[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [closed, setClosed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const beat = beats[index] ?? beats[0];

  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // finish is stable enough for the lifetime of this dialog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    startTransition(async () => {
      await markProductTourSeenAction();
      setClosed(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("tour");
      router.replace(`${url.pathname}${url.search}`);
      router.refresh();
    });
  }

  if (closed || !beat) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-tour-title"
        className="panel w-full max-w-md p-5 sm:p-6"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-deep">
          Tour {index + 1} of {beats.length}
        </p>
        <h2
          id="product-tour-title"
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 font-display text-3xl tracking-tight outline-none"
        >
          {beat.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{beat.body}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" disabled={pending} onClick={finish}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            {index > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setIndex((value) => value - 1)}>
                Back
              </Button>
            ) : null}
            {index < beats.length - 1 ? (
              <Button type="button" onClick={() => setIndex((value) => value + 1)}>
                Next
              </Button>
            ) : (
              <Button type="button" disabled={pending} onClick={finish}>
                {pending ? "Saving..." : "Done"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
