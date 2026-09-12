"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[fweta] route error:", error);
  }, [error]);

  return (
    <div className="bg-atmosphere flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-3xl tracking-tight text-foreground md:text-4xl">
        Page unavailable
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        Something went wrong loading this page. Try again — if it persists, check your connection
        and Supabase configuration.
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
