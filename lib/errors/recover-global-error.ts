import { startTransition } from "react";

// reset() only clears the boundary, so the failed tree renders again and the error
// page stays. Refresh with the router, and reload the document when that router is
// not mounted (global-error replaces the root layout).
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

/** Uses the router refresh when it is mounted, and reloads the document when it is not. */
export function recoverFromError(
  reset: () => void,
  router?: { refresh?: () => void } | null,
  reload?: () => void,
): void {
  if (router && typeof router.refresh === "function") {
    const refresh = router.refresh.bind(router);
    recoverGlobalError(reset, refresh, reload);
    return;
  }
  recoverGlobalError(reset, undefined, reload);
}

function defaultReload(): void {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}
