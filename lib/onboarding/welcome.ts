export type WelcomeEmailInput = {
  userId: string;
  email: string;
  displayName: string;
  roles: readonly string[];
};

type WelcomeSender = (input: WelcomeEmailInput) => Promise<void> | void;

const GLOBAL_KEY = "__fwetaSendWelcome";

/**
 * Resend (or any mailer) can register a sender without this module importing it.
 * Signup calls `triggerWelcomeEmail`. If nothing is registered, the call is a no-op.
 */
export function registerWelcomeEmail(sender: WelcomeSender) {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = sender;
}

export function clearWelcomeEmail() {
  delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
}

export async function triggerWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
  const sender = (globalThis as unknown as Record<string, WelcomeSender | undefined>)[GLOBAL_KEY];
  if (!sender) return;
  try {
    await sender(input);
  } catch (err) {
    console.warn("[fweta] welcome email failed:", err instanceof Error ? err.message : err);
  }
}
