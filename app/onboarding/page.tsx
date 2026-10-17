import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { sessionGate } from "@/lib/auth/session-gate";
import { getProfileById, getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/onboarding/steps";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/onboarding");

  const profile = await getProfileById(session.id);
  if (!profile) redirect("/login");
  const gate = sessionGate(session, profile);
  if (gate === "suspended" || gate === "expired") {
    redirect(`/api/auth/end-session?reason=${gate}`);
  }

  if (!needsOnboarding(profile)) {
    redirect("/dashboard");
  }

  return <OnboardingWizard roles={profile.roles} />;
}
