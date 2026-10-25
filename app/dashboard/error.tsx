"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch("/api/observability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest ?? "",
        source: "dashboard",
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <Link href="/" className="inline-flex items-center gap-2" aria-label="fweta">
        <Image
          src="/brand/fweta-mark.png"
          alt=""
          width={29}
          height={32}
          className="shrink-0 object-contain"
          aria-hidden
        />
        <span className="text-[1.05rem] font-semibold tracking-tight text-foreground">fweta</span>
      </Link>
      <h1 className="mt-6 font-display text-3xl tracking-tight text-foreground">This page did not load</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        fweta could not open this part of your workspace. Try again, or go back home.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Link href="/">
          <Button variant="secondary">Back home</Button>
        </Link>
      </div>
    </div>
  );
}
