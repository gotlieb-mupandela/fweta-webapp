"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[fweta] dashboard error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-3xl">Dashboard unavailable</h1>
      <p className="mt-3 max-w-md text-sm text-muted">
        A server error occurred while loading this page. This is often caused by Supabase
        configuration — confirm migrations are applied and Vercel env vars are set.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-muted">Error ID: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
      >
        Try again
      </button>
    </div>
  );
}
