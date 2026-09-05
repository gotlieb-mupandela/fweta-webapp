"use client";

import { useEffect } from "react";

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
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-semibold">Page unavailable</h1>
      <p className="mt-3 max-w-md text-sm opacity-70">
        Something went wrong loading this page. Try again — if it persists, check
        your connection and Supabase configuration.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs opacity-60">Error ID: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white"
      >
        Try again
      </button>
    </div>
  );
}
