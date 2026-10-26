"use client";

import { Component, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { recoverFromError } from "@/lib/errors/recover-global-error";

function useOptionalRouter(): { refresh: () => void } | null {
  // useRouter throws when global-error replaces the root layout. Catching that
  // keeps the button on screen and falls back to a document reload.
  try {
    return useRouter();
  } catch {
    return null;
  }
}

function TryAgainWithRouter({ reset }: { reset: () => void }) {
  const router = useOptionalRouter();
  return (
    <Button type="button" onClick={() => recoverFromError(reset, router)}>
      Try again
    </Button>
  );
}

class TryAgainBoundary extends Component<{ reset: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <Button type="button" onClick={() => recoverFromError(this.props.reset, null)}>
          Try again
        </Button>
      );
    }
    return this.props.children;
  }
}

/** reset() plus a router refresh. Reloads the document when the router is not mounted. */
export function TryAgain({ reset }: { reset: () => void }) {
  return (
    <TryAgainBoundary reset={reset}>
      <TryAgainWithRouter reset={reset} />
    </TryAgainBoundary>
  );
}
