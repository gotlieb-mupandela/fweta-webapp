import { after } from "next/server";

/**
 * Run after the response is flushed. Falls back to a floating promise when
 * `after` is unavailable (scripts, tests) so the work still happens.
 */
export function runAfterResponse(task: () => Promise<void>): void {
  const safe = async () => {
    try {
      await task();
    } catch (err) {
      console.warn(
        "[fweta] background notification failed:",
        err instanceof Error ? err.message : err,
      );
    }
  };

  try {
    after(() => {
      void safe();
    });
  } catch {
    void safe();
  }
}
