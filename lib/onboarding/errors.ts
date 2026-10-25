import { randomBytes } from "crypto";

import { StoreConflictError, StoreDeadlineError } from "@/lib/db/store-commit";
import { StorePersistError } from "@/lib/db/supabase-store";

const INFRA =
  /supabase|postgres|database|migration|fweta_|pgrst|service role|schema cache|environment variable|\benv\b|configuration|revision check/i;

export function onboardingRequestId(): string {
  return randomBytes(4).toString("hex");
}

export function isInfrastructureError(err: unknown): boolean {
  if (
    err instanceof StorePersistError ||
    err instanceof StoreConflictError ||
    err instanceof StoreDeadlineError
  ) {
    return true;
  }
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return INFRA.test(message);
}

function isSafeUserMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 180) return false;
  return !INFRA.test(trimmed);
}

/**
 * Message safe to show on the onboarding screen.
 * The real error is logged with the same reference id.
 */
export function clientErrorFromUnknown(err: unknown): string {
  const requestId = onboardingRequestId();
  console.error(`[fweta] onboarding ${requestId}`, err);
  if (err instanceof Error && !isInfrastructureError(err) && isSafeUserMessage(err.message)) {
    return err.message;
  }
  return `We could not save your progress. Try again. Reference ${requestId}.`;
}
