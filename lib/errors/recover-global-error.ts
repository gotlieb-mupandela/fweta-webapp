import { startTransition } from "react";

// global-error replaces the root layout. reset() only clears the boundary, so the
// failed tree renders again and the error page stays. Refresh with the router, and
// reload the document when that router is not mounted.
export function recoverGlobalError(
  reset: () => void,
  refresh?: () => void,
  reload: () => void = defaultReload,
): void {
  if (typeof refresh === "function") {
    startTransition(() => {
      refresh();
      reset();
    });
    return;
  }
  reset();
  reload();
}

function defaultReload(): void {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}
