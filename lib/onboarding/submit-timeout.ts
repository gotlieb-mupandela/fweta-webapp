export const ONBOARDING_SUBMIT_TIMEOUT_MS = 25_000;

export const ONBOARDING_SLOW_MESSAGE =
  "This is taking longer than usual. Your answers are saved on this device. Try again.";

export class OnboardingTimeoutError extends Error {
  constructor(message = ONBOARDING_SLOW_MESSAGE) {
    super(message);
    this.name = "OnboardingTimeoutError";
  }
}

/**
 * Stop waiting on a server action after `ms`. The server call itself is not
 * cancelled; a later retry must be safe to run again.
 */
export function withOnboardingTimeout<T>(
  work: Promise<T>,
  ms = ONBOARDING_SUBMIT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new OnboardingTimeoutError());
    }, ms);
  });
  const guarded = work.then(
    (value) => {
      controller.abort();
      return value;
    },
    (error: unknown) => {
      controller.abort();
      throw error;
    },
  );
  controller.signal.addEventListener(
    "abort",
    () => {
      if (timer) clearTimeout(timer);
    },
    { once: true },
  );
  return Promise.race([guarded, timeout]);
}
