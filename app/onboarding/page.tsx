import { redirect, unstable_rethrow } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getProfileById, getSession } from "@/lib/auth/session";
import { onboardingRequestId } from "@/lib/onboarding/errors";
import { getOnboardingSteps, needsOnboarding } from "@/lib/onboarding/steps";
import { answersFromOnboarding, resumeWizardIndex } from "@/lib/onboarding/wizard-resume";
import type { UserRole } from "@/types/enums";

type Ready = {
  kind: "ready";
  userId: string;
  roles: UserRole[];
  initialIndex: number;
  initialAnswers: ReturnType<typeof answersFromOnboarding>;
  initialXp: number;
};

type OnboardingLoad =
  | { kind: "login" }
  | { kind: "dashboard" }
  | { kind: "error"; requestId: string }
  | Ready;

async function loadOnboardingPage(): Promise<OnboardingLoad> {
  try {
    const session = await getSession();
    if (!session) return { kind: "login" };
    const profile = await getProfileById(session.id);
    if (!profile) return { kind: "login" };
    if (!needsOnboarding(profile)) return { kind: "dashboard" };

    const steps = getOnboardingSteps(profile.roles);
    const initialIndex = resumeWizardIndex(steps, profile.onboarding);
    return {
      kind: "ready",
      userId: profile.id,
      roles: profile.roles,
      initialIndex,
      initialAnswers: answersFromOnboarding(profile),
      initialXp: steps.slice(0, initialIndex).reduce((sum, step) => sum + step.xp, 0),
    };
  } catch (err) {
    unstable_rethrow(err);
    const requestId = onboardingRequestId();
    console.error(`[fweta] onboarding page ${requestId}`, err);
    return { kind: "error", requestId };
  }
}

export default async function OnboardingPage() {
  const loaded = await loadOnboardingPage();
  if (loaded.kind === "login") redirect("/login?next=/onboarding");
  if (loaded.kind === "dashboard") redirect("/dashboard");
  if (loaded.kind === "error") {
    return (
      <div className="bg-atmosphere flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <Logo size="sm" href="/login" />
        <h1 className="mt-8 font-display text-3xl tracking-tight text-foreground md:text-4xl">
          We could not open setup
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          Your answers on this device are still here. Refresh the page and try again. Reference{" "}
          {loaded.requestId}.
        </p>
      </div>
    );
  }

  return (
    <OnboardingWizard
      userId={loaded.userId}
      roles={loaded.roles}
      initialIndex={loaded.initialIndex}
      initialAnswers={loaded.initialAnswers}
      initialXp={loaded.initialXp}
    />
  );
}
