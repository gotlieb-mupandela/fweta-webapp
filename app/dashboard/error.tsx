"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[fweta] dashboard error:", error);
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
      <h1 className="font-display text-3xl tracking-tight text-foreground">Dashboard unavailable</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        A server error occurred while loading this page. This is often caused by Supabase
        configuration. Confirm migrations are applied and Vercel env vars are set.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-muted-light">Error ID: {error.digest}</p>
      ) : null}
      <Button type="button" onClick={() => reset()} className="mt-6">
        Try again
      </Button>
    </div>
  );
}
