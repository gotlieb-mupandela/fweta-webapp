export const ONBOARDING_SESSION_KEY = "fweta.onboarding.wizard";
const SESSION_EVENT = "fweta-onboarding-storage";

export type OnboardingSessionSnapshot<TAnswers> = {
  v: 1;
  userId: string;
  index: number;
  xp: number;
  answers: TAnswers;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export function readOnboardingSession<TAnswers>(
  storage: StorageLike,
  userId: string,
): OnboardingSessionSnapshot<TAnswers> | null {
  try {
    const raw = storage.getItem(ONBOARDING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingSessionSnapshot<TAnswers>>;
    if (parsed.v !== 1 || parsed.userId !== userId) return null;
    if (typeof parsed.index !== "number" || !Number.isInteger(parsed.index) || parsed.index < 0) {
      return null;
    }
    if (typeof parsed.xp !== "number" || !Number.isFinite(parsed.xp)) return null;
    if (!parsed.answers || typeof parsed.answers !== "object") return null;
    return {
      v: 1,
      userId,
      index: parsed.index,
      xp: parsed.xp,
      answers: parsed.answers,
    };
  } catch {
    return null;
  }
}

export function writeOnboardingSession<TAnswers>(
  storage: StorageLike,
  snapshot: OnboardingSessionSnapshot<TAnswers>,
): void {
  try {
    storage.setItem(ONBOARDING_SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    // A full or blocked session store must not stop the person from continuing.
  }
  if (typeof window !== "undefined" && storage === window.sessionStorage) {
    window.dispatchEvent(new Event(SESSION_EVENT));
  }
}

export function clearOnboardingSession(storage: StorageLike, userId: string): void {
  const current = readOnboardingSession(storage, userId);
  if (!current) return;
  storage.removeItem(ONBOARDING_SESSION_KEY);
  if (typeof window !== "undefined" && storage === window.sessionStorage) {
    window.dispatchEvent(new Event(SESSION_EVENT));
  }
}

export function subscribeOnboardingSession(onChange: () => void): () => void {
  window.addEventListener(SESSION_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SESSION_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function onboardingSessionRaw(): string {
  return window.sessionStorage.getItem(ONBOARDING_SESSION_KEY) ?? "";
}
